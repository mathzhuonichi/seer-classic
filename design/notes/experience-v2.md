# Experience revision 0.2

The user reported these issues after playing the first desktop delivery. These are presentation and interaction requirements; the recovered battle formulas remain in use.

| Reported issue | Implemented response |
| --- | --- |
| Some portraits, especially Bubu Seed, look blurred. | Recover 143 original official vector portraits, covering all 114 original images whose longest side was below 100 pixels. Preserve the remaining original raster images and document their resolution limits. |
| Creature size is inconsistent across evolution stages. | Measure visible silhouette bounds for every species and share grounded stage scaling between cards, details, maps, and battle. Bubu Seed, Bubu Grass, and Bubu Flower use increasing relative extents. These extents are presentation choices, not claims about canonical height. |
| Opponents face the wrong direction. | Mirror the enemy's facing wrapper independently of motion and sizing. |
| Combat commands and log placement feel unlike classic Seer. | Restore the four battle, item, creature, and escape command panels, a central dialogue strip, and centered expandable history. See `battle-presentation.md` for the official guide reference. |
| Skill use has no motion or effects. | Drive shared physical, special, status, and hit modules from ordered engine events, with intermediate HP values, effect feedback, and command locking during playback. |
| Creature and item management lack clear categories. | Split party, storage, and collection views; separate raising, learning values, skills, and raising items. Categorize essence, combat supplies, raising items, and retained capsules. |
| The next version needs maps and more interaction. | Add seven destinations with walking, clickable locations, local encounters, SPT entries, recovery, and quest interactions. Retain direct anytime access to all challenges. |
| Subagents should use a consistent configuration. | Use three GPT-6.1-sol agents with high reasoning effort for assets and scale, battle presentation, and interactive exploration. Their work is integrated in this repository. |

The scenery and exploration layout are authored for this remake rather than presented as recovered official map art. Fifth skills, soul marks, and engravings retain the previously agreed extension interfaces. This revision does not fill their datasets or change the outstanding three trait limitations.
