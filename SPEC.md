# BrandBlitz IL – Master Specification & Architecture

**Source of truth** for product, stack, and data flow.

---

## 1. Vision & Goal

BrandBlitz IL is a **Micro-SaaS for the Israeli market**. It allows small business owners to generate high-quality, social-media-ready content (Images & Videos) in **60 seconds**.

- **Key Problem:** AI models (Flux, Imagen, Kling) fail at Hebrew typography (outputting gibberish).
- **Key Solution:** **The Layering Protocol.** AI generates only the background; the app overlays Hebrew text and logos using code (Remotion / HTML / Canvas).

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), Tailwind CSS (Dark Mode), Framer Motion |
| **Video Engine** | Remotion (React-based video rendering) |
| **Backend / Auth** | Firebase (Firestore, Auth, Storage) |
| **Automation** | In-app server pipeline + workers (no Make.com) |
| **AI – Text / Logic** | Google Gemini 2.5 Flash |
| **AI – Static Images** | Google Imagen 4 (Nano Banana) |
| **AI – Generative Video (Premium)** | Kling AI or Veo 3.1 |

---

## 3. Core System Architecture (Data Journey)

### Phase 1: Frontend Input (Client)

- User logs in via **Firebase Auth**.
- User uploads a **Logo (PNG)** → saved in **Firebase Storage**.
- User selects a **Niche** (e.g. "Sushi") and clicks **Generate**.
- App creates a document in Firestore: `generations/{genId}` with `status: processing`.
- App triggers **POST** to the app server (`/api/generate`) which runs the AI pipeline.

### Phase 2: Orchestration (Server + Workers)

- **The Brain (Gemini 2.5 Flash):** Receives `niche` (and `type`).  
  Outputs JSON: `{ "overlayText": "Hebrew Text", "caption": "Hebrew Text", "prompt": "English Prompt" }`.  
  Constraint: `prompt` must ask for **negative space** for text overlay.

- **The Artist (Imagen 4 / Nano Banana):** Receives `image_prompt`.  
  Generates a **Clean Plate** (background only, **no text**).

- **Status updates:** The app server/workers update Firestore `generations/{genId}` directly:  
  `status: "done"` (or `"pending_review" → "rendering"` for Remotion), `resultUrl` / `sourceImageUrl`, `caption`, `overlayText`.

### Phase 3: Assembly (Hybrid Overlay)

- **Image display:** App shows `resultUrl` and overlays `overlayText` (headline) with HTML/CSS.
- **Video (Remotion):** Remotion component uses `sourceImageUrl` as background, applies **Ken Burns (slow zoom)**, animates headline and logo. Output: MP4 with clear Hebrew.

---

## 4. Feature Requirements

| Feature | Requirement |
|--------|--------------|
| **Credits** | Balance in Firestore. **Standard** (Image + Remotion) = **1 Credit**. **Premium** (Kling/Veo) = **10 Credits**. |
| **RTL** | Every UI element **Right-to-Left**. |
| **Aesthetic** | TikTok-style: high-contrast, dark mode, neon accents (Cyan/Pink). |
| **Easy Post** | One button: **download video/image** + **copy caption** to clipboard. |

---

## 5. Mapping to Codebase

| Spec term | Code / Firestore |
|-----------|------------------|
| headline | `overlayText` |
| caption | `caption` |
| image_prompt | Prompt sent to Imagen (internal to Make) |
| imageUrl | `resultUrl` (or `sourceImageUrl` for Remotion input) |
| Standard Post | `type: "image"` or `type: "remotion"` (1 credit each) |
| Premium Post | `type: "premium"` (10 credits) |

This file is the **master spec**. Implementation details (e.g. `MAKE-SCENARIO-EXACT.md`, `BRANDBLITZ-FLOW.md`) follow it.
