# GitHub Pages and Oracle APEX

The `main` branch builds the Vite app and deploys `dist/` to GitHub Pages. The published asset base is `/zu-apex-assets/`.

For Oracle APEX application 158, add this URL under **User Interface → JavaScript → File URLs**:

```text
https://ahmadlhm.github.io/zu-apex-assets/apex-loader.js
```

The loader only mounts the dashboard on application 158, page 1. It loads the generated CSS and ES module from Pages there, keeping ORDS requests on the university origin. Leave the global CSS File URLs field empty because styles are loaded only on the target page.

GitHub Pages must use **GitHub Actions** as its build and deployment source. Each push to `main` triggers a new build and deployment.
