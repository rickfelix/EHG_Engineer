# How to Add a New Project - Super Simple Guide

## You Only Need 3 Things:
1. Your project name (like "my-app")
2. Your GitHub username 
3. Your repository name on GitHub

---

## Step 1: Make a Copy of the Template

Type this in your terminal and press Enter:
```
cp .env.project-template .env.project-registration
```

**What this does:** Makes a copy of the template file that you can edit.

---

## Step 2: Open and Edit the File

Open the file `.env.project-registration` in any text editor (Notepad, VS Code, etc.)

Find these 3 lines and change them:

### Line 1 - Your Project Name
**Find this line:**
```
PROJECT_NAME=your-project-name-here
```
**Change it to your project name, for example:**
```
PROJECT_NAME=my-cool-app
```

### Line 2 - Your GitHub Username  
**Find this line:**
```
GITHUB_OWNER=your-github-username
```
**Change it to your GitHub username, for example:**
```
GITHUB_OWNER=johndoe
```

### Line 3 - Your Repository Name
**Find this line:**
```
GITHUB_REPO=your-repo-name
```
**Change it to your repository name, for example:**
```
GITHUB_REPO=my-cool-app-repo
```

**Save the file** (usually Ctrl+S or Cmd+S)

**Ignore everything else in the file - you don't need to change it!**

---

## Step 3: Register Your Project

Type this in your terminal and press Enter:
```
node scripts/leo-register-from-env.js
```

**That's it! Your project is registered!**

---

## How to Use Your Projects

### See all your projects:
```
node scripts/leo.js projects
```

### Switch to a project:
```
node scripts/leo.js switch my-cool-app
```
(Replace "my-cool-app" with your project name)

### Check which project you're using:
```
node scripts/leo.js status
```

---

## Real Example

Let's say your GitHub is `github.com/johndoe/todo-app`

1. **Copy the template:**
   ```
   cp .env.project-template .env.project-registration
   ```

2. **Edit these 3 lines only:**
   ```
   PROJECT_NAME=todo-app
   GITHUB_OWNER=johndoe  
   GITHUB_REPO=todo-app
   ```

3. **Register it:**
   ```
   node scripts/leo-register-from-env.js
   ```

Done! Now you can use `node scripts/leo.js switch todo-app` anytime!

---

## FAQ

**Q: What if I mess up?**
A: Just start over! Copy the template again and try again.

**Q: Do I need all that Supabase stuff?**
A: No! Just leave it as is. Only change the 3 lines mentioned above.

**Q: Can I add multiple projects?**
A: Yes! Just repeat these 3 steps for each project.

**Q: Where do I find my GitHub username?**
A: Go to github.com and look at the URL when you're on your profile. It's the part after github.com/