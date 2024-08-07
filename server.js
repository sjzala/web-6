const express = require('express');
const path = require('path');
const fs = require('fs');
const legoData = require('./modules/legoSets');
const authData = require('./modules/auth-service');
const clientSessions = require('client-sessions');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware to parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Configure client-sessions middleware
app.use(clientSessions({
    cookieName: "session",
    secret: "a_super_secret_key",
    duration: 24 * 60 * 60 * 1000, // 1 day
    activeDuration: 1000 * 60 * 5 // 5 minutes
}));

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads');
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const filename = Date.now() + '-' + file.originalname;
        console.log("Uploading file to:", path.join('uploads', filename));
        cb(null, filename);
    }
});
const upload = multer({ storage: storage });

// Middleware to make session data available in all views
app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

// Middleware to ensure user is logged in
const ensureLogin = (req, res, next) => {
    if (!req.session.user) {
        res.redirect('/login');
    } else {
        next();
    }
};

// Route for the root
app.get('/', (req, res) => {
    res.render('home', { page: '/' });
});

// Route for the about page
app.get('/about', (req, res) => {
    res.render('about', { page: '/about' });
});

// Route to get all lego sets or by theme
app.get('/lego/sets', (req, res) => {
    const theme = req.query.theme;
    if (theme) {
        legoData.getSetsByTheme(theme).then(sets => {
            res.render('sets', { sets, page: `/lego/sets?theme=${theme}` });
        }).catch(err => {
            res.status(404).render('404', { message: err, page: '' });
        });
    } else {
        legoData.getAllSets().then(sets => {
            res.render('sets', { sets, page: '/lego/sets' });
        }).catch(err => {
            res.status(500).send(err);
        });
    }
});

// Route to get a specific set by number
app.get('/lego/sets/:set_num', (req, res) => {
    const setNum = req.params.set_num;
    legoData.getSetByNum(setNum).then(set => {
        res.render('set', { set, page: `/lego/sets/${setNum}` });
    }).catch(err => {
        res.status(404).render('404', { message: err, page: '' });
    });
});

// Route to show add set form
app.get('/lego/addSet', ensureLogin, (req, res) => {
    legoData.getAllThemes().then(themes => {
        res.render('addSet', { themes, page: '/lego/addSet' });
    }).catch(err => {
        res.status(500).render('500', { message: `I'm sorry, but we have encountered the following error: ${err}`, page: '' });
    });
});

// Route to add a new set
app.post('/lego/addSet', ensureLogin, (req, res) => {
    legoData.addSet(req.body).then(() => {
        res.redirect('/lego/sets');
    }).catch(err => {
        res.render('500', { message: `I'm sorry, but we have encountered the following error: ${err}`, page: '' });
    });
});

// Route to show edit set form
app.get('/lego/editSet/:num', ensureLogin, (req, res) => {
    const setNum = req.params.num;
    Promise.all([legoData.getAllThemes(), legoData.getSetByNum(setNum)]).then(([themes, set]) => {
        res.render('editSet', { themes, set, page: '/lego/editSet' });
    }).catch(err => {
        res.status(404).render('404', { message: err, page: '' });
    });
});

// Route to edit a set
app.post('/lego/editSet', ensureLogin, (req, res) => {
    legoData.editSet(req.body.set_num, req.body).then(() => {
        res.redirect('/lego/sets');
    }).catch(err => {
        res.render('500', { message: `I'm sorry, but we have encountered the following error: ${err}`, page: '' });
    });
});

// Route to delete a set
app.get('/lego/deleteSet/:num', ensureLogin, (req, res) => {
    const setNum = req.params.num;
    legoData.deleteSet(setNum).then(() => {
        res.redirect('/lego/sets');
    }).catch(err => {
        res.render('500', { message: `I'm sorry, but we have encountered the following error: ${err}`, page: '' });
    });
});

// Route to show login form
app.get('/login', (req, res) => {
    res.render('login', { errorMessage: null, userName: '', page: '/login' });
});

// Route to show register form
app.get('/register', (req, res) => {
    res.render('register', { errorMessage: null, successMessage: null, userName: '', email: '', page: '/register' });
});

// Route to register a new user
app.post('/register', upload.single('image'), (req, res) => {
    const userData = req.body;
    if (req.file) {
        userData.profileImage = '/uploads/' + req.file.filename;
        console.log("Uploaded file path stored:", userData.profileImage); // Log the uploaded file path
    } else {
        userData.profileImage = '/images/my-pic.jpeg'; // Default image
        console.log("Default image path stored:", userData.profileImage); // Log the default image path
    }
    console.log("User data with image path:", userData); // Debugging line to verify the userData object
    authData.registerUser(userData).then(() => {
        res.render('register', { successMessage: "User created successfully!", errorMessage: null, userName: '', email: '', page: '/register' });
    }).catch(err => {
        console.error("Error during user registration:", err); // Debugging line to show errors
        res.render('register', { errorMessage: err, successMessage: null, userName: req.body.userName, email: req.body.email, page: '/register' });
    });
});

// Route to login a user
app.post('/login', (req, res) => {
    req.body.userAgent = req.get('User-Agent');
    authData.checkUser(req.body).then((user) => {
        req.session.user = {
            userName: user.userName,
            email: user.email,
            profileImage: user.profileImage,
            loginHistory: user.loginHistory
        };
        console.log("User session data:", req.session.user); // Log session data to verify
        res.redirect('/lego/sets');
    }).catch(err => {
        res.render('login', { errorMessage: err, userName: req.body.userName, page: '/login' });
    });
});

// Route to logout a user
app.get('/logout', (req, res) => {
    req.session.reset();
    res.redirect('/');
});

// Route to show user history
app.get('/userHistory', ensureLogin, (req, res) => {
    res.render('userHistory', { page: '/userHistory' });
});

// Custom 404 error page
app.use((req, res) => {
    res.status(404).render('404', { message: "I'm sorry we're unable to find what you're looking for", page: '' });
});

// Start the server
legoData.initialize()
    .then(authData.initialize)
    .then(function () {
        console.log("Initialization successful");
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    }).catch(function (err) {
        console.log(`unable to start server: ${err}`);
    });

module.exports = app;
