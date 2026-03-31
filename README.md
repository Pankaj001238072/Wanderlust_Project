# Wanderlust Booking Platform

Wanderlust is a full-stack premium web application for discovering and booking unique stays. Built using **Node.js, Express, MongoDB (Mongoose), EJS, and Bootstrap**, it integrates modern services like **Cloudinary (image storage), Stripe (payments), MapTiler (maps), and Nodemailer (emails)**. It also features a custom-built **AI Assistant** powered by **Google Gemini**.



## Unique Features & Highlights

* **Strong Backend Validation:** Joi + custom middleware for all inputs
* **Secure Booking System:** Stripe integration with session-based flow
* **In-App Notification System:** Real-time DB-backed dropdown for successful bookings, signups, profile updates, and subscriptions.
* **AI Travel Assistant:** Modern floating chatbot powered by **Google Gemini 2.5 Flash** (upgraded to prevent free-tier `429 Quota Exhausted` errors on new accounts) for instant travel guidance.
* **User Wishlist:** Save and manage favorite listings.
* **Email Notifications:**

  * Booking confirmation (with full details & amount)
  * Cancellation email (refund or failure info)
  * Offers & newsletter emails
* **Ownership Controls:** Only owners can edit/delete their data
* **Security:**

  * Helmet (headers)
  * CSRF protection
  * Rate limiting
  * Secure sessions (Mongo store)
* **Map Integration:** Interactive maps via MapTiler
* **Cloudinary Integration:**

  * Image upload & management
  * Images compressed using **sharp**
  * Old images auto-deleted from Cloudinary
  * Temp files cleaned after upload
* **Offers & Discounts:** Owners create offers → subscribers notified
* **Newsletter:** Footer-based subscription (SMTP-based)
* **Contact & Report Forms:** Email-based support system
* **Automated Maintenance:** Hourly `setInterval` logic in `app.js` to auto-delete expired offers and keep the DB clean.
* **Responsive UI:** Mobile-first modern design with custom premium components and Glassmorphism effects.
* **Performance:** Gzip response compression (`compression` middleware) and optimized static asset delivery.
* **User Profile System:** Edit profile details, upload profile photos (locally processed), and view booking history.
* **Demo User:** Single-click testing with pre-configured demo credentials.



## Tech Stack

### Backend

* Node.js (Runtime)
* Express.js 5.x (Web Framework)
* MongoDB (NoSQL Database)
* Mongoose (ODM)
* Passport.js (Authentication - Local Strategy)
* Joi (Data Validation)
* Sharp (Image Processing)

### Frontend

* EJS (Templating Engine)
* EJS-Mate (Layouts & Partials)
* Bootstrap 5
* Custom CSS3 (with Glassmorphism & Micro-animations)
* HTML5 Semantic Elements

### Integrations

* Stripe (Secure Payments)
* Cloudinary (Image Hosting)
* MapTiler (Interactive Geospatial Maps)
* Nodemailer (SMTP Email Distribution)
* Google Gemini 2.5 Flash (AI Intelligence)
* Brevo (SMTP Relay Service)
* Google reCAPTCHA v2 (Form Security)



## Project Structure


MAJORPROJECT/
├── app.js
├── controllers/
├── models/
├── routes/
├── middlewares/
├── schemas/
├── helpers/
├── views/
├── public/
│   ├── css/
│   ├── js/
│   └── images/
├── uploads/                  # temp listing images
├── public/uploads/profile/   # temp profile images
├── tests/                    # test files (optional)
└── README.md



## Installation & Setup

1. Clone repository:

git clone <repo-url>
cd MAJORPROJECT

2. Install dependencies:

npm install

3. Create `.env` file:

ATLASDB_URL=
SESSION_SECRET=

STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=

MAP_TOKEN=

CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_API_SECRET=

SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=2525 # Use 2525 to bypass Render outbound SMTP blocks
SMTP_USER=     # Your Brevo SMTP Login ID (NOT always your email)
SMTP_PASS=     # Your Brevo SMTP Key (starts with xsmtpsib-)
CONTACT_EMAIL_RECEIVER=

PAYMENT_SESSION_TTL_MIN=30

DEMO_USER_USERNAME=
DEMO_USER_EMAIL=
DEMO_USER_PASSWORD=

RECAPTCHA_SECRET_KEY=
RECAPTCHA_SITE_KEY=
GEMINI_API_KEY= # Generate your API key from https://aistudio.google.com/

4. Run the application:
```bash
node app.js
# OR
nodemon app.js
```

5. For local development, open your browser and visit:
```text
http://localhost:8080
```
*(Note: Once deployed on Render, the app will automatically use the live Render URL instead of localhost).*

## Main Features

* Authentication (signup/login/logout)
* Listings CRUD
* Booking system (Stripe + email confirmations)
* Reviews & ratings
* Offers system (discounts + email alerts)
* Newsletter subscription (footer)
* In-App Notification tracking (DB-backed)
* Personal Wishlist management
* AI Travel Assistant (Gemini AI integration)
* Contact & report system (email + captcha)
* Map-based listings (MapTiler)
* Image upload (Cloudinary + sharp optimization)
* Full security stack (Helmet, CSRF, rate limiting)


## Main Routes

| Route         | Description         |
| ------------- | ------------------- |
| /listings     | View all listings   |
| /listings/:id | View single listing |
| /listings/wishlist | User wishlist |
| /bookings     | Start booking       |
| /bookings/my  | User bookings       |
| /notifications| Notification logic  |
| /api/chat    | AI chatbot backend  |
| /offer        | Offers system       |
| /contact      | Contact form        |
| /report       | Report issue        |
| /signup       | Register            |
| /login        | Login               |
| /logout       | Logout              |
| /help         | Help center         |
| /privacy      | Privacy policy      |
| /terms        | Terms               |


## Key Modules

### Offers

* Owners create discounts
* Users + subscribers notified
* Files: `controllers/offers.js`, `routes/offer.js`

### Newsletter

* Footer subscription
* SMTP-based system (configured for Brevo/Gmail)
* Files: `controllers/subscriber.js`

### Notifications & Wishlist

* DB-backed in-app notifications
* Save favorite listings
* Files: `models/notification.js`, `routes/notification.js`, `controllers/listing/listingRead.js`

### AI Chatbot

* Google Gemini AI Integration
* Floating UI widget with real-time response
* Files: `controllers/aiChat.js`, `routes/ai.js`, `public/js/chatbot.js`

### Booking

* Stripe integration
* Payment validation + session logic
* Files: `controllers/bookings.js`

### Listings

* CRUD + image upload
* Ownership protection
* Files: `controllers/listings.js`

### Reviews

* Add/delete reviews
* Ownership validation

### Contact & Report

* Email-based system
* reCAPTCHA protection


## Security

* Helmet (secure headers)
* CSRF protection
* Rate limiting
* Joi validation
* Session storage (MongoDB)
* Environment variables for secrets


## .gitignore Recommendations

node_modules/
.env
uploads/
public/uploads/profile/
*.log
*.tmp
.DS_Store
Thumbs.db

## Future Scope & Roadmap

Wanderlust aims to evolve into a more intelligent and user-centric platform. The following features are planned for future releases:

*   **📈 Dynamic Pricing Logic (Surge & Discount Pricing):** 
    - **Weekend Surge:** Automatically increase prices by 10-15% for Friday-Sunday check-ins.
    - **Last Minute Deals:** Auto-apply 20% discounts for same-day bookings to improve occupancy.
*   **💬 Real-Time Chat & Negotiation:**
    - Integrated **Socket.io** chat for direct communication between guests and hosts.
    - **"Make an Offer"** feature allowing guests to negotiate prices directly.
*   **🗺️ Map-Based "Near Me" & Geospatial Search:**
    - Advanced search using **MongoDB Geospatial Queries (`$near`)** to find stays within a specific radius (e.g., 5km) from the user's current location.
*   **🧑‍🍳 Local Experiences & Add-on Services:**
    - Hosts can offer additional services like Airport Pickup, Bonfire Setup, or Local Meals as part of the booking invoice.
*   **☀️ Weather-Based Smart Recommendations:**
    - Integration with **OpenWeatherMap API** to suggest properties based on local weather conditions (e.g., suggesting indoor stays during rain).
*   **💸 Split The Fare:**
    - Group booking system where multiple users can split the payment for a single stay.
*   **🎁 Loyalty/Wallet & Referral System:**
    - In-app wallet for cashback, referral rewards, and easier checkout.

## Contribution

1. Fork repo
2. Create branch
3. Commit changes
4. Open PR

## License

MIT License