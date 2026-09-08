### Release Notes 1.9.9

#### Bug Fixes

- Fixed notes and long log lines not wrapping inside the operation window.
- Fixed package notes accidentally including the rest of the update log. Long notes now scroll inside their own panel.
- Fixed bucket updates giving up after a temporary connection error. These updates now retry automatically up to two times.
- Fixed partial bucket updates showing as a complete failure. They now show a warning listing the buckets that could not be updated.
- Fixed installs and updates failing when rScoop could not find the Scoop command, including when running as administrator. Thanks to @maphew for PR #81!

#### Maintenance

- Updated dependencies.
