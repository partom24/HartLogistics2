# OFFLINE BENCHMARK FIXTURE. Fresh flat LAB world HartLogistics15PerfFlat ONLY.
# One time physical build; no registry indexing. Run /hartlogistics:diag_index_flat separately.
# Correct doubling clones: z 0..1 -> 2, 0..3 -> 4, 0..7 -> 8, 0..15 -> 16, 0..3 -> 32.
tp @s 20 -49 18
fill 0 -59 0 38 -56 0 hartsorter:sorter ["minecraft:cardinal_direction"="north","hartlogistics:mode"="wildcard"]
fill 0 -55 0 38 -55 0 minecraft:hopper ["facing_direction"=0]
fill 1 -59 0 1 -55 0 minecraft:air
fill 3 -59 0 3 -55 0 minecraft:air
fill 5 -59 0 5 -55 0 minecraft:air
fill 7 -59 0 7 -55 0 minecraft:air
fill 9 -59 0 9 -55 0 minecraft:air
fill 11 -59 0 11 -55 0 minecraft:air
fill 13 -59 0 13 -55 0 minecraft:air
fill 15 -59 0 15 -55 0 minecraft:air
fill 17 -59 0 17 -55 0 minecraft:air
fill 19 -59 0 19 -55 0 minecraft:air
fill 21 -59 0 21 -55 0 minecraft:air
fill 23 -59 0 23 -55 0 minecraft:air
fill 25 -59 0 25 -55 0 minecraft:air
fill 27 -59 0 27 -55 0 minecraft:air
fill 29 -59 0 29 -55 0 minecraft:air
fill 31 -59 0 31 -55 0 minecraft:air
fill 33 -59 0 33 -55 0 minecraft:air
fill 35 -59 0 35 -55 0 minecraft:air
fill 37 -59 0 37 -55 0 minecraft:air
clone 0 -59 0 38 -55 1 0 -59 2
clone 0 -59 0 38 -55 3 0 -59 4
clone 0 -59 0 38 -55 7 0 -59 8
clone 0 -59 0 38 -55 15 0 -59 16
clone 0 -59 0 38 -55 3 0 -59 32
fill 14 -59 34 38 -55 34 minecraft:air
setblock 12 -55 34 minecraft:air
setblock 12 -56 34 minecraft:hopper ["facing_direction"=0]
