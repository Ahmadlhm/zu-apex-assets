# GitHub Pages and Oracle APEX

The `main` branch contains the editable source. GitHub Actions builds the Vite app and publishes `dist/` to the `gh-pages` branch. The Pages site serves that branch at `https://ahmadlhm.github.io/zu-apex-assets/`.

For Oracle APEX application 158, add this URL under **User Interface → JavaScript → File URLs**:

```text
https://ahmadlhm.github.io/zu-apex-assets/apex-loader.js
```

The loader only mounts the dashboard on application 158, page 1. The page's `dash` region should contain only `<div id="root"></div>`; the version tracked in this repository is `apex/page-1-dashboard-region.html`. The loader loads the generated CSS and ES module there, keeping ORDS requests on the university origin. Leave the global CSS File URLs field empty because styles are loaded only on the target page.

GitHub Pages is configured to publish the root of the `gh-pages` branch. Each push to `main` triggers a build and updates that branch. The first Actions run could not start because GitHub reports an account billing lock; the current site was published directly to `gh-pages`. Once the account lock is resolved, pushes to `main` will update the site automatically.
