# LEO Protocol - Project Registration Guide

## Quick Start (3 Simple Steps)

### Step 1: Copy the Template
```bash
cp .env.project-template .env.project-registration
```

### Step 2: Edit Your Project Details
Open `.env.project-registration` in any text editor and replace these three required fields:

```bash
PROJECT_NAME=your-project-name-here      # Example: my-todo-app
GITHUB_OWNER=your-github-username        # Example: johndoe
GITHUB_REPO=your-repo-name              # Example: todo-app-repo
```

Everything else can stay as default!

### Step 3: Register Your Project
```bash
node scripts/leo-register-from-env.js
```

That's it! Your project is registered.

---

## Managing Multiple Projects

LEO Protocol is designed to handle multiple projects easily:

### See All Your Projects
```bash
node scripts/leo.js projects
```

### Switch Between Projects
```bash
node scripts/leo.js switch [project-name]
```
Example: `node scripts/leo.js switch my-todo-app`

### Check Current Project
```bash
node scripts/leo.js status
```

---

## Example: Registering Your First Project

Let's say you have a GitHub repository at `github.com/johndoe/my-awesome-app`:

1. **Copy the template:**
   ```bash
   cp .env.project-template .env.project-registration
   ```

2. **Edit `.env.project-registration`:**
   ```bash
   PROJECT_NAME=my-awesome-app
   GITHUB_OWNER=johndoe
   GITHUB_REPO=my-awesome-app
   ```

3. **Register it:**
   ```bash
   node scripts/leo-register-from-env.js
   ```

4. **Switch to it:**
   ```bash
   node scripts/leo.js switch my-awesome-app
   ```

---

## FAQ

**Q: What if I don't have Supabase?**
A: No problem! The template has placeholder values that won't affect your project.

**Q: Can I register multiple projects?**
A: Yes! Just repeat the process for each project. The registration file gets archived after each successful registration.

**Q: Where are my credentials stored?**
A: They're encrypted and stored in the `applications/[APP_ID]/credentials/` folder.

**Q: How do I update project details after registration?**
A: Edit the `applications/registry.json` file directly, or re-register with updated details.

---

## Need Help?

- Run `node scripts/leo.js help` for all LEO commands
- Check `.env.project-template` for detailed field descriptions
- Your registered projects are stored in `applications/registry.json`