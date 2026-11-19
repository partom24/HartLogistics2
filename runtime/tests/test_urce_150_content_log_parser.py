"""Offline tests: client Content Log evidence is distinct from RP source existence."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("bedrock_log", ROOT/"scripts/analyze_bedrock_content_log.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class ContentLogTests(unittest.TestCase):
    def test_repeated_missing_geometry_is_grouped_by_client_load(self):
        result = mod.summarize([
            "20:58:32[Blocks][error]-Block name = 'hartsorter:sorter' | Missing referenced asset geometry.hartlogistics.sorter_mask_north",
            "20:58:32[Blocks][error]-Block name = 'hartsorter:sorter' | Error with geometry component: cannot find geometry.hartlogistics.sorter_mask_north geometry JSON.",
            "21:25:29[Blocks][error]-Block name = 'hartsorter:sorter' | Missing referenced asset geometry.hartlogistics.sorter_mask_north",
            "21:25:29[Blocks][error]-Block name = 'hartsorter:transporter' | Missing referenced asset geometry.hartlogistics.transporter",
            "21:25:29[Sound][verbose]-No sound found for block type 'stone'",
            "21:25:29[Effects][error]-particles/pending_effect.particle.json | Failed to load particle effect",
        ])
        self.assertEqual(result["geometry_lookup_error_lines"], 4)
        self.assertEqual(result["severity_counts"], {"Blocks":4, "Effects":1})
        model = result["geometry"]["hartsorter:sorter"]["geometry.hartlogistics.sorter_mask_north"]
        self.assertEqual(model["count"],3)
        self.assertEqual(model["times"],["20:58:32","21:25:29"])

    def test_no_false_geometry_claim_when_only_sound_noise(self):
        result=mod.summarize(["19:00:00[Sound][verbose]-No sound found", "anything"])
        self.assertEqual(result["geometry_lookup_error_lines"],0)
        self.assertEqual(result["geometry"],{})

if __name__ == "__main__":
    unittest.main()
