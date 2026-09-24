# Harbor architecture

This is the nine-file architecture kit used by the harbor screenshot approved
on 2026-09-24. Textures are embedded in the GLBs. No local_assets directory or
source-game installation is required to import or export the game.

Provenance: converted Lineage II architecture and interior resources (NCsoft),
assembled from the local 17_25 reference scene. House bodies and roofs were combined;
the merchant building includes its floor and interior props, with the original vertical door jambs and arched head restored.
Uniform building scale provides the game's character clearance. These are modified source-game assets,
not original project artwork and not covered by the project's code license.

SI_H01–SI_H04 and SI_SH01–SI_SH03: complete exterior buildings.
merchant_complete.glb: complete enterable merchant building. Front facade stonework
UVs are reprojected continuously across the doorway to remove triangle stretching.

temple_complete.glb: SI_CH_Body with SI_CH_Inner, CH_In_Front, CH_In_Hall,
CH_In_Pir columns and original BSP floor from the same 17_25 scene. Mirrored
actor transforms are baked with corrected winding and floor normals. The model
is placed at a uniform scale of 3; the original church remains in the other town.
The merchant building's secondary door panel is removed to open the second
visible entrance. Embedded weapons signs are shown only on the weapons shop.
