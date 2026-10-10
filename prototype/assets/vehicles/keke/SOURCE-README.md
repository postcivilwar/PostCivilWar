# Yellow Nigerian Keke — three GLB assets

These are custom photo-referenced approximations, not photogrammetry scans or exact manufacturer replicas. Hidden surfaces are inferred. All three have yellow bodywork with lightly worn embedded paint texture, woven black canopy, transparent windshield, seats, mirrors, lamps, steps, chassis, exhaust and tyre treads.

## Files and references
- keke_classic_yellow.glb — IMG_7976.jpeg: classic round-headlamp style.
- keke_tvs_yellow.glb — IMG_7975.jpeg: yellow interpretation of the blue rear-view TVS-style reference; front geometry is inferred.
- keke_modern_yellow.glb — IMG_7974.jpeg: modern rectangular-headlamp style.

## Integration
GLB 2.0, metre units, Y-up, embedded PNG material textures, approximately 57,000 triangles and 26–27 mesh objects per model. No external textures required. Import into Blender, Godot, Unity or Unreal using their glTF support.

Keke_Root is the vehicle transform. Steering_Pivot controls front-wheel yaw around local Y in glTF. Wheel_Front, Wheel_Rear_Left and Wheel_Rear_Right are separate wheel pivots; roll around local X. The front wheel is a child of Steering_Pivot, while the fork and mudguard also follow steering. Wheel radius is approximately 0.25 m.

Two embedded demonstration clips: Wheel_Roll (one revolution in two seconds) and Steering_Sweep (centre, left, centre, right, centre). Play them separately or together. Disable the demo clips when applying your own gameplay controls. For runtime rolling, angular displacement = travelled distance / 0.25, using the sign appropriate to your engine orientation.

Driving physics, suspension simulation, engine controller, collision hulls and engine-specific scripts are NOT included. Add these in your game engine; use simple collision shapes rather than the render mesh. These are visual assets with rigged wheel transforms, not a complete vehicle simulation. There are no LOD variants; triangle and draw-call budgets must be assessed for your target game.

## Checks performed
All three actual exported GLBs reimported successfully into Blender. Each file has three wheel pivots and two animation clips, non-empty meshes, metre-scale bounds, and embedded textures. Front and rear inspection renders of every model were reviewed. This is not an engine-specific gameplay test.

## Geometry statistics
- keke_classic_yellow.glb: 57,828 triangles; 26 mesh objects.
- keke_tvs_yellow.glb: 57,292 triangles; 27 mesh objects.
- keke_modern_yellow.glb: 57,292 triangles; 27 mesh objects.
