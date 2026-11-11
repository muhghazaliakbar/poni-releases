# Installing Poni (beta)

**English** · [Bahasa Indonesia](INSTALL.id.md)

Poni needs **macOS 14 Sonoma or later**. It's at its best on a MacBook with a notch; on screens without
one, Poni shows a virtual notch in the middle of the menu bar.

## Why does macOS hold Poni back?

Beta releases are signed with Poni's own certificate (named "NotchKit Beta Signing", Poni's former name)
instead of an Apple Developer ID, and they aren't notarized yet. So Gatekeeper stops the app the **first**
time you open it. That doesn't mean anything is wrong with it. You only confirm once: updates installed
from **Check for Updates** skip this step, and the permissions you've granted (Calendar, Notifications…)
stay in place.

## Steps

1. Open `Poni-<version>.dmg` and drag **Poni** to **Applications**.
2. Open Poni from the Applications folder. macOS shows *"Poni" Not Opened*. Click **Done**.

### macOS 15 Sequoia and later

3. Open **System Settings → Privacy & Security**.
4. Scroll to **Security**. You'll see *"Poni" was blocked to protect your Mac*.
   Click **Open Anyway** and enter your Mac's password.
5. Click **Open Anyway** again in the dialog. Poni opens and shows its introduction.

The **Open Anyway** button only appears for about an hour after the attempt in step 2. If you don't see
it, repeat step 2.

### macOS 14 Sonoma

3. In Finder, right-click (or Control-click) **Poni** in Applications, choose **Open**, then click
   **Open** in the dialog.

### Alternative: Terminal (any version)

```bash
xattr -dr com.apple.quarantine /Applications/Poni.app
```

This removes the "downloaded from the internet" flag from the app, so Poni opens right away.

## Verifying the download (optional)

Check that the app is signed by the same "NotchKit Beta Signing" certificate listed on the release page:

```bash
codesign -dv --verbose=2 /Applications/Poni.app 2>&1 | grep Authority
codesign -d -r- /Applications/Poni.app
```

The `designated => … certificate leaf = H"…"` line must match the fingerprint on the release page.

## Uninstalling

Quit Poni from its menu bar icon, then delete `Poni.app` from Applications. Optional data:
`~/Library/Application Support/Poni` (plugins and Shelf) and the `app.useponi.poni` preferences.
