# Belmond Fabrics and Tailor — Admin Panel

A private, bespoke, and secure web application for managing dress showcase photographs for **Belmond Fabrics and Tailor** (`belmondfabrics.com`), designed to be hosted at `admin.belmondfabrics.com`.

---

## 🌟 Overview & Architecture

```
[ Admin Browser / Mobile Phone ]
               │ (HTTP-only secure session cookie)
               ▼
[ Node.js + Express Server (Port 3001) ]
  ├── Server-Side Password Check (timingSafeEqual)
  ├── Route Auth Guard (requireAuth middleware)
  └── Multi-Image Processing (multer memory stream)
               │ (Privileged Server API Client)
               ▼
[ Supabase Project (mardkilahpajcucjkvjs.supabase.co) ]
  ├── Storage Bucket: dress-images
  └── Database Table: public.dresses
               ▲
               │ (Public Read Query: is_visible = true)
[ Main Website (belmondfabrics.com / Port 3000) ] (100% Untouched)
```

---

## 🔒 Security Principles

1. **Zero Secret Exposure in Frontend**:
   - The admin password is **never** embedded or checked in client JavaScript.
   - The Supabase `service_role` key is **never** sent to the browser.
   - All write operations (uploads, visibility toggling, deletions) run exclusively through authenticated server endpoints.
2. **Simple Private Access**:
   - No Gmail, email, OTP, sign-up, or user management bloat.
   - Access is guarded by a single admin password stored in server environment variables (`ADMIN_PASSWORD`).
   - Constant-time string comparison (`crypto.timingSafeEqual`) prevents timing attacks.
   - Successful authentication issues a cryptographically signed, `HttpOnly`, `SameSite=Lax` cookie (`belmond_admin_token`).
3. **Protected API Endpoints**:
   - All `/api/dresses/*` and `/api/stats/*` endpoints strictly require a valid admin cookie.
   - Any unauthenticated request immediately receives `401 Unauthorized` and is redirected to the login gate.

---

## 🎨 Visual Identity & UI

- **Design System**: Luxury dark obsidian (`#0B0C0E`) with champagne gold accents (`#C9A86A`, `#DFBA73`) and crisp warm cream typography (`#F7F5F0`).
- **Typography**: Google Fonts *Cormorant Garamond* (editorial serif) and *Montserrat* (clean UI sans).
- **Mobile First**: Built with responsive layouts, touch-friendly tap targets, and a thumb-navigable bottom navigation bar for mobile devices.

---

## ⚙️ Environment Variables

Create a `.env` file in the project root based on `.env.example`:

```env
# Server Port
PORT=3001
NODE_ENV=development

# Supabase Project Configuration (Same project as Main Website)
SUPABASE_URL=https://mardkilahpajcucjkvjs.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Admin Access Password
ADMIN_PASSWORD=your_secure_password

# Session Cookie Secret
SESSION_SECRET=your_long_random_session_secret
```

> [!IMPORTANT]
> **Supabase Service Role Key (`SUPABASE_SERVICE_ROLE_KEY`)**:
> In Supabase, the `public.dresses` table and `dress-images` storage bucket have Row-Level Security (RLS) enabled.
> The `anon` key only has read permissions (`SELECT`).
> To allow the Admin Panel server to upload photos and save records, add your **`service_role`** (secret) key to `.env`:
> 1. Open your **Supabase Dashboard** (`https://supabase.com/dashboard/project/mardkilahpajcucjkvjs`).
> 2. Navigate to **Project Settings** > **API**.
> 3. Under **Project API keys**, copy the **`service_role` (secret)** key.
> 4. Paste it into `.env` as `SUPABASE_SERVICE_ROLE_KEY=...`.

---

## 🚀 Running Locally

```bash
# 1. Install dependencies
npm install

# 2. Run automated test suite
npm test

# 3. Start development server (Node watch mode)
npm run dev
```

The Admin Panel will be accessible at:
👉 **[http://localhost:3001](http://localhost:3001)**

The Main Website runs concurrently at:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📱 Features

### 1. Dashboard
- **Total Dresses**: Count of all dress records in the database.
- **Published Dresses**: Count of dress records currently live on `belmondfabrics.com`.
- **Hidden Dresses**: Count of dress records saved in the database but hidden from public view.
- **Quick Action**: Prominent `[ + Upload Dresses ]` button.
- **Recent Uploads**: Preview grid showing the latest uploads with status badges and timestamps.

### 2. Upload System
- **Multiple File Selection**: Pick multiple photos at once on mobile or desktop.
- **Drag & Drop**: Fluid desktop dropzone with hover feedback.
- **Pre-Upload Staging**: Preview selected images, check file sizes, and remove individual photos before uploading.
- **Format Support**: Supports JPG, JPEG, PNG, WEBP (up to 25MB per file).
- **Collision-Resistant Filenames**: Generates `dress_<timestamp>_<uuid>.<ext>` to eliminate CDN/browser caching collisions.
- **Progress Tracking**: Real-time progress bar and status updates.
- **Automatic Sync**: Newly uploaded images are automatically assigned `is_visible: true` and appear immediately on the Main Website without redeployment.

### 3. Manage Dresses
- **Responsive Grid**: High-resolution image cards with zoom preview.
- **Filter Tabs**: Filter by `All`, `Published`, or `Hidden`.
- **Hide / Show Toggle**:
  - `[ Hide ]`: sets `is_visible = false`. Main Website instantly stops displaying the image.
  - `[ Show ]`: sets `is_visible = true`. Main Website displays the image again.
  - Storage file is preserved when hiding.
- **Permanent Delete**:
  - Confirmation modal: *"Delete this dress image permanently?"*
  - Deletes both the database record in `public.dresses` and the image file from Supabase Storage `dress-images`.

---

© Belmond Fabrics and Tailor. All rights reserved.
