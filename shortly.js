var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var session = require('express-session')
var bcrypt = require('bcrypt');
var passport = require('passport')
var GitHubStrategy = require('passport-github2').Strategy;



var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));

app.use(session({
  secret: 'keyboard cat',
  cookie: {}
}));

function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.error = 'Access denied!';
    res.status(403)
    res.redirect('/');
  }
}

app.get('/', function(req, res) {
  res.render('login');
});

app.get('/create', function(req, res) {
  console.log('here in create')
  // console.log(req)
  res.render('index');
});

app.get('/links', function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.status(200).send(links.models);
  });
});

app.post('/links', function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.sendStatus(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.status(200).send(found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.sendStatus(404);
        }

        Links.create({
          url: uri,
          title: title,
          baseUrl: req.headers.origin
        })
        .then(function(newLink) {
          res.status(200).send(newLink);
        });
      });
    }
  });
});


/************************************************************/
// Write your authentication routes here
/************************************************************/

// Authenticate HERE!!
app.post('/login', function(req, res) {
  console.log(req.body)
  var username = req.body.username;
  var password = req.body.password;

  new User({username: username}).fetch().then(function(user) {
    if(user) {
      var salt = user.attributes.salt;
      var hash = bcrypt.hashSync(password, salt);

      if (user.attributes.password === hash) {
        req.session.regenerate(function(){
          req.session.user = username;
          res.redirect('/create');
        });

      } else {
        res.send(403, 'Incorrect credentials')
      }
    } else {
      res.send(403, 'Incorrect credentials')
    }

    //console.log('Here is the ', user.attributes.salt);
  })

  if(username == 'demo' && password == 'demo'){
    req.session.regenerate(function(){
      req.session.user = username;
      res.redirect('/create');
    });
  }
  else {
    // console.log('here')
    // res.redirect('login');
  }
});

// Server Signup HTML
app.get('/signup',
function(req, res) {
  res.render('signup');
});


// Creates new user
app.post('/signup', function(req, res) {
  new User({username: req.body.username}).fetch().then(function(model){
    if(model){
      res.send(400, 'User already exists')
    } else {
      var salt = bcrypt.genSaltSync(10);
      var hash = bcrypt.hashSync(req.body.password, salt);
      console.log(hash)
      new User({
        username: req.body.username,
        password: hash,
        salt: salt
      })
      .save()
      .then(function(model) {
        res.send(201);
      });
    }
  })

});

// app.get('/signout', function(req, res) {
//   req.session.destroy(function(){
//       res.redirect('/');
//   });
// })


app.get('/signout', function(req, res){
  req.logout();
  res.redirect('/');
});

/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

passport.use(new GitHubStrategy({
    clientID: '8d8cf4873e622bb86bf1',
    clientSecret: 'c9d6f72320746f806348ddd07edceeef622834db',
    callbackURL: "http://127.0.0.1:4568/auth/github/callback"
  },
  function(accessToken, refreshToken, profile, done) {
    // User.findOrCreate({ githubId: profile.id }, function (err, user) {
    //   return done(err, user);
    // });
    console.log(profile, "profile<<<<<<<<")
    new User({githubId: profile.id}).fetch().then(function(model){
      if(!model){
        new User({
          username: login,
          githubId: profile.id
        })
        .save()
      }
    })
  }
));


app.get('/auth/github/callback',
  passport.authorize('github', { failureRedirect: '/', scope: [ 'user:email' ] }),
  function(req, res) {
    console.log(req, 'request from callback<<<<<<<')
    res.redirect('/create');
  });


app.get('/auth/github',
  passport.authenticate('github', { scope: [ 'user:email' ] }));



// handle all other requests
app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        linkId: link.get('id')
      });

      click.save().then(function() {
        link.set('visits', link.get('visits') + 1);
        link.save().then(function() {
          return res.redirect(link.get('url'));
        });
      });
    }
  });
});

module.exports = app;
