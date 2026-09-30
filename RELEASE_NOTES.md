### Release Notes 1.11.0

#### Scoop 0.6.0 Support

* Full support for the renamed scoop-install.json and scoop-manifest.json files. Pre-0.6.0 installs keep working and stay supported until October 2027.
* New dismissible warning when your Scoop is below 0.6.0, with details and upgrade guidance.
* More reliable progress and error reporting on Scoop 0.6.0's updated command output.

#### Improvements

* Direct URL installs are no longer mistaken for version-pinned installs.
* Version switching now explains itself on setups without junctions instead of failing silently.
* Startup no longer fails when the log directory is locked or unwritable; logging falls back to the console.
* System shim paths display normalized between 32-bit and 64-bit views.
