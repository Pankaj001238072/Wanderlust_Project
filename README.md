# 🚀 Wanderlust | Travel Booking Platform

[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge\&logo=nodedotjs\&logoColor=white)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge\&logo=express\&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge\&logo=mongodb\&logoColor=white)](https://www.mongodb.com/)
[![Gemini AI](https://img.shields.io/badge/Google_Gemini-8E75B2?style=for-the-badge\&logo=google\&logoColor=white)](https://aistudio.google.com/)
[![Stripe](https://img.shields.io/badge/Stripe-635BFF?style=for-the-badge\&logo=stripe\&logoColor=white)](https://stripe.com/)

🌐 **Live Demo:** https://wanderlust-project-nhvd.onrender.com
📌 **GitHub Repo:** https://github.com/Pankaj001238072/Wanderlust_Project

---

## 💡 About the Project

**Wanderlust** is a full-stack travel booking platform where users can explore, wishlist, and book unique stays.

This project started as a learning journey, but I extended it by adding multiple advanced real-world features like:

* AI chatbot integration (Google Gemini)
* Secure booking system with Stripe
* Real-time notifications system
* Full backend security implementation

👉 The goal was to build a production-level application, not just a tutorial project.

---

## 📸 Screenshots

### 🏠 Home Page

![Home](screenshots/home.png)

### 🔍 Search & Listings

![Listings](screenshots/listing.png)

### 💳 Booking Flow

![Booking](screenshots/booking.png)

### 🤖 AI Travel Assistant

![AI](screenshots/ai.png)

---

## 🎥 Demo Video

👉 (Add your video link here)

---

## 🌟 Key Features

### 🔐 Secure System

* Authentication (Signup/Login/Logout)
* Session-based login (MongoDB store)
* CSRF protection, Helmet, Rate Limiting
* Joi validation for all inputs

### 🏠 Core Features

* Listings CRUD (Create, Read, Update, Delete)
* Reviews & Ratings
* Wishlist system
* User profile management

### 💳 Booking System

* Stripe payment integration
* Booking confirmation emails
* Cancellation & refund handling

### 🤖 Smart Features

* AI Travel Assistant (Google Gemini)
* Real-time in-app notifications
* Newsletter & email system (Nodemailer)

### 🗺️ Maps & Media

* MapTiler integration (location-based listings)
* Cloudinary image upload & storage
* Sharp image optimization

---

## 🛠️ Tech Stack

### Backend

* Node.js
* Express.js
* MongoDB
* Mongoose
* Passport.js (Authentication)
* Joi (Validation)

### Frontend

* EJS
* Bootstrap 5
* Custom CSS (Glassmorphism UI)

### Integrations

* Stripe (Payments)
* Cloudinary (Image Hosting)
* MapTiler (Maps)
* Nodemailer (Emails)
* Google Gemini AI

---

## 📂 Project Structure

MAJORPROJECT/
├── app.js
├── controllers/
├── models/
├── routes/
├── middlewares/
├── views/
├── public/
├── uploads/
└── README.md

---

## 🚀 Setup Instructions

### 1️⃣ Clone Repo

git clone https://github.com/Pankaj001238072/Wanderlust_Project.git
cd Wanderlust_Project

### 2️⃣ Install Dependencies

npm install

### 3️⃣ Create .env File

ATLASDB_URL=
SESSION_SECRET=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
MAP_TOKEN=
CLOUD_NAME=
CLOUD_API_KEY=
CLOUD_API_SECRET=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
PAYMENT_SESSION_TTL_MIN=
GEMINI_API_KEY=

### 4️⃣ Run Project

npm start

👉 Open: http://localhost:8080

---

## 📈 Future Improvements

* Real-time chat using Socket.io
* “Near Me” geospatial search
* Dynamic pricing system
* Group booking (split payment)
* Loyalty & referral system

---

## 🤝 Contribution

Contributions are welcome!
Feel free to fork and improve the project.

---

## 📩 Contact

Developed by **Pankaj Singh**

🔗 LinkedIn: https://www.linkedin.com/in/pankaj-878772224/
📧 Email: pankajsaini71004@gmail.com

---

## ⭐ Support

If you like this project, consider giving it a ⭐ on GitHub!

---

License: MIT
