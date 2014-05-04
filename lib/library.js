'use strict';

var crypto = require('crypto')
  , db = require('./db')
  , http = require('http')
  , ObjectID = require('mongodb').ObjectID;

module.exports = {
  authenticate: function(username, password, callback) {
    db.findOne('users', {username: username}, function(err, user) {
      if (user && (user.password === encryptPassword(password)))
        callback(err, user._id);
      else
        callback(err, null);
    });
  },
      
  createUser: function(username, email, password, callback) {
	var defaultAvatar = '/img/avatar/default.png';
	var currentWins = 0;
	var currentLosses = 0;
    var user = {username: username, email: email, password: encryptPassword(password), avatar:defaultAvatar, wins: currentWins, losses:currentLosses};
    db.insertOne('users', user, callback);
  },
  
  createAchievement: function(username, callback) {
	var achievement = {username: username, ubers:0, ou:0, uu:0, nu:0, lc:0};
	db.insertOne('achievements', achievement, callback);
  },

  getSessionStore: function() {
    return sessionStore;
  },
  
  ensureAuthenticated: function (req, res, next) {
    if (req.session._id) {
      return next();
    }
    res.redirect('/loginPage');
  },

  mailUpdate: function(id, email, callback) {
    db.updateById('users', new ObjectID(id), {email: email}, callback);
  },  
  
  avatarUpdate: function(id, newAvatar, callback) {
    db.updateById('users', new ObjectID(id), {avatar: "/img/avatar/"+newAvatar+".png"}, callback);
  }, 

  getUserById: function(id, callback) {
    db.findOne('users', {_id: new ObjectID(id)}, callback);
  },

  getUser: function(username, callback) {
    db.findOne('users', {username: username}, callback);
  },
  
  getAchievements: function(username, callback) {
	db.findOne('achievements', {username: username}, callback);
  },
  
  setShowdownUser: function(id, name, callback){
	var idstring = id.toString();
	callback = (callback || function() { });
	db.updateById('users', new ObjectID(idstring), {showdownUser: name}, callback);
  },
  //x = {fieldname: data}
  
  //var x = {}
  //x[fieldname] = data
  
  
  // This is to update user win/loss counts when they conclude a battle
  updateWinLoss: function(user, status, format, callback){
	// Get the PokeApp user associated with winner/loser
	db.findOne('users', {showdownUser: user}, function(err, user) {
		if(status === 'win')
		{
			console.log("updating wins for " + user.username);
			var newWins = user.wins + 1;
			db.updateById('users', new ObjectID(user._id.toString()), {wins: newWins},function(err) {
				console.log(err);
			});
			// Update user achievements
			// Parse the format text
			format = format.substring(0,5);
			console.log(format);
			if(format != "ubers") format = format.substring(0,2);
			
			db.findOne('achievements', {username: user.username}, function(err, achievement) {
				var achieved = achievement[format];
				achieved = achieved + 1;
				var updateField = {};
				updateField[format] = achieved;
				console.log("updateField = " + updateField[format]);
				db.updateById('achievements', new ObjectID(achievement._id.toString()), updateField, function(err) {
					console.log(err);
				});
			});
		}
		else if(status === 'loss')
		{
			console.log("updating losses for " + user.username);
			var newLoss = user.losses + 1;
			db.updateById('users', new ObjectID(user._id.toString()), {losses: newLoss}, function(err) {
				console.log(err);
			});
		}
		else {
			console.log("Error: invalid win/loss status.");
		}
		if(callback) callback();
	});
  },
  
	// Get all users
	getUsers: function(callback){
		db.find('users', {}, 0, function(err, users){
			if (callback) callback(err, users);
		});
	}
}

function encryptPassword(plainText) {
  return crypto.createHash('md5').update(plainText).digest('hex');
}