# TypeScript Configuration Explained: apps/api/tsconfig.json

This document explains every line in the API's TypeScript configuration and why it's needed.

---

## The Complete File

```json
{
  "extends": "@nairarails/tsconfig/base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"],
  "references": [
    { "path": "../../packages/shared-types" },
    { "path": "../../packages/webhook-core" }
  ]
}
```

---

## Line-by-Line Breakdown

### Line 2: `"extends": "@nairarails/tsconfig/base.json"`

**What it does:**  
Inherits all compiler options from the shared base configuration at `packages/tsconfig/base.json`.

**Why you need it:**  
- **DRY principle**: Instead of duplicating 20+ compiler options in every package, you define them once in the base config
- **Consistency**: All packages (api, web, shared-types, webhook-core) use the same TypeScript strictness rules
- **Easier maintenance**: Change one file to update TypeScript settings across the entire monorepo

**How it resolves:**  
1. TypeScript looks for `@nairarails/tsconfig` in `node_modules/`
2. Finds the symlink: `node_modules/@nairarails/tsconfig` → `packages/tsconfig/`
3. Reads `packages/tsconfig/package.json` which has `"exports": {"./base.json": "./base.json"}`
4. Loads `packages/tsconfig/base.json`

**What you inherit from base.json:**
```typescript
{
  "target": "ES2022",              // Output ES2022 JavaScript
  "module": "NodeNext",            // Node.js ESM module system
  "moduleResolution": "NodeNext",  // Node.js module resolution
  "lib": ["ES2022"],               // Available built-in APIs
  "strict": true,                  // Enable all strict checks
  "exactOptionalPropertyTypes": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitReturns": true,
  "noFallthroughCasesInSwitch": true,
  "forceConsistentCasingInFileNames": true,
  "resolveJsonModule": true,
  "esModuleInterop": true,
  "skipLibCheck": true,
  "declaration": true,             // Generate .d.ts files
  "declarationMap": true,
  "sourceMap": true
}
```

---

## Line 3-7: `"compilerOptions"`

These options **override or extend** the base configuration for the API package specifically.

### Line 4: `"outDir": "./dist"`

**What it does:**  
All compiled JavaScript output goes to the `dist/` folder.

**Why you need it:**  
- **Separation**: Keeps compiled `.js` files separate from source `.ts` files
- **Clean builds**: You can delete `dist/` and rebuild without touching source code
- **Deployment**: Production only needs the `dist/` folder, not `src/`

**Example:**
```
src/server.ts     → dist/server.js
src/routes/auth.ts → dist/routes/auth.js
```

---

### Line 5: `"rootDir": "./src"`

**What it does:**  
Tells TypeScript that all source files are under `src/`. This controls the output structure.

**Why you need it:**  
Without this, if you have a file outside `src/`, TypeScript would recreate the entire folder structure in `dist/`.

**Example WITHOUT rootDir:**
```
apps/api/src/server.ts     → dist/apps/api/src/server.js  ❌ Bad!
apps/api/test/setup.ts     → dist/apps/api/test/setup.js
```

**Example WITH rootDir:**
```
apps/api/src/server.ts     → dist/server.js  ✅ Good!
(test files excluded via exclude)
```

---

### Line 6: `"composite": true`

**What it does:**  
Enables **TypeScript Project References**. This is the key to fast, incremental builds in monorepos.

**Why you need it:**  
1. **Incremental compilation**: TypeScript caches build info and only recompiles changed files
2. **Build dependencies**: TypeScript knows `@nairarails/shared-types` must build before `api`
3. **Type-checking across packages**: The API can reference types from shared-types without bundling its code
4. **Parallel builds**: Turbo can build multiple packages simultaneously when their references allow it

**What it creates:**
- `tsconfig.tsbuildinfo` — cache file tracking what was compiled last time

**Without composite:**
- TypeScript would recompile everything on every build (slow)
- Workspace dependencies wouldn't have type information
- `pnpm build` would fail because packages wouldn't know about each other's types

---

### Line 7: `"types": ["node"]`

**What it does:**  
Only include Node.js type definitions (`@types/node`), not browser types.

**Why you need it:**  
The API is a **Node.js backend** (Express server), not a browser app. Including browser types would:
- Add incorrect globals like `window`, `document`, `localStorage`
- Allow you to accidentally use browser APIs that don't exist in Node.js
- Increase TypeScript's memory usage

**Example of what this prevents:**
```typescript
// Without "types": ["node"], this would compile but crash at runtime:
localStorage.setItem("key", "value");  // ❌ localStorage doesn't exist in Node.js

// With "types": ["node"], TypeScript errors:
// ❌ Cannot find name 'localStorage'
```

**Types included:**
- `Buffer` (Node.js-specific)
- `process.env`
- `__dirname`, `__filename`
- All Node.js built-in modules (fs, path, http, etc.)

---

## Line 8: `"include": ["src/**/*"]`

**What it does:**  
Tells TypeScript to **compile all files** inside the `src/` directory, recursively.

**Pattern breakdown:**
- `src/` — start in the src directory
- `**/` — match any number of nested subdirectories
- `*` — match any filename

**Files matched:**
```
src/server.ts                     ✅
src/routes/auth.ts                ✅
src/routes/orders.ts              ✅
src/lib/prisma.ts                 ✅
src/middleware/rateLimiter.ts     ✅
src/integrations/nombaClient.ts   ✅
```

**Files NOT matched:**
```
test/setup.ts           ❌ (not in src/)
prisma/schema.prisma    ❌ (not TypeScript)
README.md               ❌ (not TypeScript)
```

---

## Line 9: `"exclude": ["node_modules", "dist"]`

**What it does:**  
Explicitly tells TypeScript to **ignore** these directories.

**Why you need it:**

### `"node_modules"`
- Contains thousands of third-party packages
- Already have their own compiled `.js` files
- Would massively slow down compilation if TypeScript tried to process them
- **Already excluded by default**, but explicitly listing it makes intent clear

### `"dist"`
- Contains your own compiled output
- Would create infinite loops if TypeScript tried to compile the compiled output
- Would double memory usage during builds

**What happens without exclude:**
```bash
# TypeScript would try to compile:
node_modules/express/lib/express.js       # 1000s of files
node_modules/@types/node/index.d.ts       # Already processed
dist/server.js                            # Would recompile your output!
```

---

## Line 10-13: `"references"`

**What it does:**  
Declares that the API **depends on** these other TypeScript projects in the monorepo.

**Why you need it:**  
This is how TypeScript Project References work. It tells TypeScript:
1. "Before compiling `api`, make sure `shared-types` and `webhook-core` are built"
2. "Load type definitions from those packages"
3. "Don't bundle their code into my output"

### Line 11: `{ "path": "../../packages/shared-types" }`

**What it does:**  
Creates a reference to the `shared-types` package.

**Enables:**
```typescript
// In apps/api/src/routes/orders.ts:
import { CreateOrderRequestSchema } from "@nairarails/shared-types";
                                        ↑
                          TypeScript knows where to find this
```

**Without this reference:**
```
❌ Error: Cannot find module '@nairarails/shared-types' or its corresponding type declarations.
```

**What TypeScript does:**
1. Follows the path to `../../packages/shared-types`
2. Reads `packages/shared-types/tsconfig.json`
3. Loads type definitions from `packages/shared-types/dist/index.d.ts`
4. Makes those types available in the API code

---

### Line 12: `{ "path": "../../packages/webhook-core" }`

**What it does:**  
Creates a reference to the `webhook-core` package.

**Enables:**
```typescript
// In apps/api/src/routes/webhooks.ts:
import { verifyNombaWebhook, classify, calculateSplits } from "@nairarails/webhook-core";
                                                              ↑
                                              TypeScript knows these functions exist
```

**Build order guarantee:**
With these references, when you run `pnpm build`:
1. ✅ `shared-types` builds first (no dependencies)
2. ✅ `webhook-core` builds second (depends on shared-types)
3. ✅ `api` builds last (depends on both)

Turbo enforces this via `turbo.json`:
```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"]  // ^ means "dependencies must build first"
    }
  }
}
```

---

## Why Each Section Matters

### 1. **extends** (Line 2)
**Problem without it:** Every package duplicates 20 compiler options. Changing strictness rules requires editing 4+ files.  
**Solution:** One shared base config inherited by all packages.

### 2. **outDir + rootDir** (Lines 4-5)
**Problem without it:** Messy builds with compiled files mixed into source folders, incorrect output structure.  
**Solution:** Clean separation: `src/` for source, `dist/` for output.

### 3. **composite** (Line 6)
**Problem without it:** Slow builds, no caching, can't use project references, TypeScript recompiles everything every time.  
**Solution:** Fast incremental builds, only changed files recompile.

### 4. **types: ["node"]** (Line 7)
**Problem without it:** Browser types leak into server code, allows bugs like using `window` in Node.js.  
**Solution:** Only Node.js types available, catches Node.js/browser mistakes at compile time.

### 5. **include** (Line 8)
**Problem without it:** TypeScript doesn't know what to compile.  
**Solution:** Explicitly tells TypeScript "compile everything in src/".

### 6. **exclude** (Line 9)
**Problem without it:** TypeScript wastes time processing dependencies and compiled output.  
**Solution:** Skips irrelevant directories for faster builds.

### 7. **references** (Lines 10-13)
**Problem without it:** Can't import from workspace packages, TypeScript doesn't know build order.  
**Solution:** Type-safe imports across packages, correct build dependencies.

---

## How It All Works Together

### When you run `pnpm build`:

1. **Turbo reads `turbo.json`:**
   ```json
   "build": { "dependsOn": ["^build"] }
   ```
   "Build dependencies first"

2. **TypeScript reads `apps/api/tsconfig.json`:**
   ```json
   "references": [
     { "path": "../../packages/shared-types" },
     { "path": "../../packages/webhook-core" }
   ]
   ```
   "I need shared-types and webhook-core"

3. **Build order:**
   ```
   shared-types: compiles src/ → dist/
   webhook-core: compiles src/ → dist/ (can now import shared-types)
   api:          compiles src/ → dist/ (can now import both)
   ```

4. **TypeScript for api:**
   - Loads base.json (strict rules)
   - Merges api-specific options (outDir, rootDir, types, composite)
   - Includes all files in src/
   - Excludes node_modules and dist
   - Loads type definitions from referenced packages
   - Compiles to dist/ preserving folder structure

5. **Result:**
   ```
   apps/api/dist/
   ├── server.js
   ├── server.js.map
   ├── server.d.ts
   ├── routes/
   │   ├── auth.js
   │   ├── orders.js
   │   └── webhooks.js
   ├── lib/
   │   ├── prisma.js
   │   └── logger.js
   └── middleware/
       ├── rateLimiter.js
       └── apiKeyAuth.js
   ```

---

## Common Questions

### Q: Why not put everything in one big tsconfig.json?
**A:** Monorepos have different needs:
- `api` is Node.js ESM server → needs `"types": ["node"]`
- `web` is React browser app → needs `"lib": ["DOM"]`, `"jsx": "react-jsx"`
- `shared-types` is just types → needs `"declaration": true` but no runtime code

### Q: Can I remove `composite: true`?
**A:** No! Without it:
- Project references break
- Incremental builds don't work
- `pnpm build` will fail with "Cannot find module '@nairarails/shared-types'"

### Q: Why NodeNext instead of ESNext?
**A:** `NodeNext` is Node.js's **actual ESM implementation**, which has specific rules:
- Requires `.js` extensions in imports (even for `.ts` files)
- Respects `"type": "module"` in package.json
- Handles Node.js-specific module resolution

`ESNext` is generic and would allow incorrect imports that break at runtime.

### Q: What if I don't use `rootDir`?
**A:** Your output structure would be wrong:
```
# Without rootDir:
dist/src/server.js  ❌

# With rootDir:
dist/server.js  ✅
```

---

## Quick Reference

| Option | Purpose | Without It |
|--------|---------|------------|
| `extends` | Inherit base config | Duplicate 20+ options everywhere |
| `outDir` | Where compiled JS goes | Mixed source and output files |
| `rootDir` | Where source TS starts | Wrong output folder structure |
| `composite` | Enable project references | No incremental builds, no cross-package types |
| `types: ["node"]` | Node.js types only | Browser types leak into server |
| `include` | What to compile | TypeScript doesn't know what to compile |
| `exclude` | What to skip | Wastes time on node_modules and dist |
| `references` | Package dependencies | Can't import workspace packages |

---

## Testing Your Understanding

Try removing each option one at a time and run `pnpm build` to see what breaks:

1. Remove `"composite"` → `❌ Error: Cannot use project references without composite`
2. Remove `"references"` → `❌ Error: Cannot find module '@nairarails/shared-types'`
3. Remove `"extends"` → `⚠️ Still works but loses all base config strictness`
4. Remove `"outDir"` → `❌ Compiled files dump into src/`
5. Remove `"types": ["node"]` → `⚠️ Browser types leak in, allows bugs`

---

## Summary

This tsconfig.json is **perfectly configured** for a Node.js backend in a pnpm monorepo using TypeScript Project References. Every line serves a purpose:

✅ Inherits shared strict settings  
✅ Outputs clean compiled code to dist/  
✅ Enables fast incremental builds  
✅ Prevents browser types in server code  
✅ Compiles only source files  
✅ Skips unnecessary directories  
✅ Type-safe imports from workspace packages  

**Don't modify this file unless you understand why each line exists!**
