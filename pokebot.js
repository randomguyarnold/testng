'use strict';

var db = require('./lib/db')
  , express = require('express')
  , library = require('./lib/library')
  , fs = require('fs')
  , path = require('path')
  , routes = require('./routes/routes.js');

var app = express.createServer();
app.configure(function () {
  app.use(express.bodyParser());
  app.use(express.bodyParser({ keepExtensions: true, uploadDir: "uploads" }));   
  app.use(express.cookieParser());
  app.use(express.session({secret: 'secretpasswordforsessions'}));
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(express.static(__dirname + '/public'));
});
app.set('view options', {
  layout: false
});
app.get('/', routes.getIndex);
app.get('/loginPage', routes.getLogin);
app.get('/api/user/:username', routes.getUser);
app.get('/about', routes.getAbout);
app.get('/play', library.ensureAuthenticated, routes.getPlay);
app.get('/fight', library.ensureAuthenticated, routes.fightBattle);
app.post('/fight', library.ensureAuthenticated, routes.fightBattle);
app.get('/war', routes.getLeaderboard);
app.get('/profile', library.ensureAuthenticated, routes.profile);
app.post('/submitFile', library.ensureAuthenticated, routes.submitFile);
app.post('/updateEmail', library.ensureAuthenticated, routes.updateEmail);
app.post('/updateAvatar', library.ensureAuthenticated, routes.updateAvatar);
app.post('/getLeaderboard', routes.getLeaderboard);
app.get('/loginError', routes.loginError);
app.post('/login', routes.login);
app.post('/signup', routes.signup);
app.post('/setShowdownName', library.ensureAuthenticated, routes.setShowdownName);
app.post('/setWin', routes.setWin);
app.post('/setLoss', routes.setLoss);
app.get('/logout', function(req, res){
	// Clears associated showdown user on logout to prevent people having duplicate showdown usernames.
	library.setShowdownUser(req.session._id, 'null');

	req.session.destroy();
	res.redirect('/');
});
app.post('/actionphp', routes.ActionPHP);
 
db.open(function() {
  app.listen(3000);
});