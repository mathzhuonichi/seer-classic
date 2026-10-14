# Laboratory facility logo labels

The user requested higher laboratory captions styled like the original toolbar's Items logo. This change affects only facility-label CSS. Fusion and breeding captions move upward by 12% of their existing facility height; the shop caption moves from below its console to 8% from the top of its existing footprint. Label strings, equipment artwork, hitboxes, approach points, and callbacks remain unchanged.

The lettering uses the available `SeerSimHei` development font face, followed by Hei-style system fallbacks, independently of the Songti font used for ordinary interface text. Cream-and-gold lettering receives a thick brown outline and a brown backing plate with gold and cyan edges. This reproduces the visible Items-caption treatment using editable live text. The backing plate is a local CSS adaptation, not a claim that a new laboratory-logo asset was recovered from the official client.

The source Items icon and UI display-list resources were inspected. The laboratory equipment outline remains hidden. `git diff --check` verifies the edited source formatting; placement, font resolution, and logo rendering require the parent task's browser check. No game logic, save data, production build, package, or commit is changed.
