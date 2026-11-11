// Package resources contains the manager's embedded input files.
package resources

import "embed"

//go:embed package.json engines/localization/package.json engines/localization/profiles/*.json engines/localization/src/locale-main.cjs assets/branding/app-icon.png
var Files embed.FS
