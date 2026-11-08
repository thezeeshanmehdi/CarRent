# CarRent - Rent-a-Car Record Keeping

Mobile-first Next.js web application for car rental record keeping, daily earnings, expenses, odometer tracking, and monthly PDF reports.

## Setup & Deployment

1. **Push to GitHub & Import in Vercel**:
   - Framework preset: Next.js
   - Single deployment with App Router.

2. **Environment Variables**:
   - `MONGODB_URI`: MongoDB Atlas connection string (e.g. `mongodb+srv://user:password@cluster0.mongodb.net/?retryWrites=true&w=majority`).
   - `MONGODB_DB`: (Optional, default `carrent`) Database name.
   - `APP_PIN`: Initial login PIN/password (fallback if no custom PIN is set in settings).
   - `AUTH_SECRET`: (Optional) Long random string used to sign session cookies.

3. **Local Development**:
   ```bash
   npm install
   cp .env.example .env.local
   npm run dev
   ```

## Emergency PIN Recovery

If you ever forget your custom PIN/password changed from inside the app:
1. Open your **MongoDB Atlas** dashboard.
2. Go to **Database** -> **Browse Collections**.
3. Select your database (default `carrent`) -> open the `settings` collection.
4. Delete the document with `_id: "auth"`.
5. The application will immediately fall back to the `APP_PIN` defined in your Vercel (or `.env.local`) environment variables.

## PWA (Progressive Web App)

- **Android / Chrome**: Open the website in Chrome and tap **"Install app"** or menu -> **Install app** to install it in standalone mode with offline support.
- **iOS Safari**: Tap the **Share** button at the bottom, then choose **"Add to Home Screen"**.
