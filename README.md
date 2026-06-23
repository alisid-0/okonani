# Okonani

React storefront with Firebase Hosting, Firestore, Cloud Functions, and Stripe Checkout.

## One config file

All local config and secrets live in the project root `.env` only.

Copy `.env.example` to `.env` and fill in:

- Firebase web app config (`VITE_FIREBASE_*`)
- Stripe live keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
- Admin emails (`ADMIN_EMAILS`)
- Local URLs (`CLIENT_URL`, `VITE_API_BASE_URL`)

Do not create env files under `functions/`.

## How it works

1. You manage products in the admin panel at `/admin`.
2. Products are saved to Firestore.
3. Cloud Functions sync each product to Stripe automatically.
4. Checkout uses the Stripe Price IDs stored on the Firestore product.

```text
Admin panel -> Firestore products -> Stripe Products/Prices -> Checkout
```

## First-time setup

1. Create a Firebase project and enable **Firestore**, **Authentication (Email/Password)**, **Hosting**, and **Functions**.
2. Copy `.env.example` to `.env` and fill in your values.
3. Copy `.firebaserc.example` to `.firebaserc` and set your Firebase project ID.
4. In Firebase Authentication, create your admin user with the same email listed in `ADMIN_EMAILS`.
5. Put your Stripe **live** secret key and webhook secret in `.env`.
6. Bootstrap admin access into Firestore (run this once, with emulators running for local dev):

```sh
npm run bootstrap:admins
```

If you use emulators, start `npm run emulators` first. The script reads `ADMIN_EMAILS` from root `.env` and writes those emails to the `admins` collection so the backend can verify admin access.

For local dev, `ADMIN_EMAILS` in `.env` also works without this step, but running bootstrap keeps local Firestore in sync.

## Local development

Terminal 1:

```sh
npm run emulators
```

Terminal 2:

```sh
npm run dev
```

Then:

1. Open `http://localhost:5173/login`
2. Sign in with your admin account
3. Go to `/admin`
4. Create products there first
5. Visit `/store` to confirm they appear
6. Test checkout from `/cart`

## Production deploy

Push Stripe secrets from the same root `.env` into Firebase Secret Manager, then deploy:

```sh
npm run deploy
```

Before going live, configure your Stripe webhook to:

```text
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/stripeWebhook
```

Subscribe it to `checkout.session.completed`.

## Updating products later

Use the admin panel only.

- Change name/description: edit in admin, save, Stripe product updates automatically.
- Change price: edit price in admin, save, a new Stripe Price is created and linked.
- Hide a product: uncheck **Active in store** or click **Remove**.

You do not need to edit JSON files or run a seed script anymore.
