var library = require('../lib/library');
var fs = require('fs');
var jquery = require("jquery")

module.exports = {

  getIndex: function(req, res) {
    if (!req.session._id || req.cookies.username == undefined) {
      res.render('index', {type: 'unsigned', username:undefined});
    } else {
      library.getUserById(req.session._id, function(err, user) {
        var profile = [];
        if (user && user.profile) profile = user.profile;  
        res.render('index', {type: 'signed', username:user.username});
      });  
    }  
  },

  getLogin: function(req, res) {
    res.render('login');
  },

  loginError: function(req, res) {
    res.render('loginError');
  },  

  getAbout: function(req, res) {
    res.render('about');
  },

  getPlay: function(req, res) {
    library.getUserById(req.session._id, function(err, user) {
    var profile = [];
    if (user && user.profile) profile = user.profile;
	fs.readdir('public\/uploads\/' + user.username, function(err, scriptFiles){
		res.render('play', {profile:profile, username:user.username, scripts:scriptFiles});
	});  
  });
  },

  fightBattle: function(req, res) {
    library.getUserById(req.session._id, function(err, user) {
		var profile = [];
		var script = req.body.AIscript; //TODO: should make secure.
		if (user && user.profile) profile = user.profile;
		res.render('fight', {username:user.username, scriptfile: script});
  });
  },

  /*playAi: function(req, res) {
    library.getUserById(req.session._id, function(err, user) {
    var profile = [];
    if (user && user.profile) profile = user.profile;
    res.render('playai', {username:user.username});
  });
  },*/  

  // getWar: function(req, res) {
    // res.render('war');
  // },  
  
  getUser: function(req, res) {
    library.getUser(req.params.username, function(err, user) {
      if (user)
        res.send('1');
      else
        res.send('0');
    });
  },
  
  profile: function(req, res) {
    library.getUserById(req.session._id, function(err, user) {
		var profile = [];
		if (user && user.profile) profile = user.profile;
		
		library.getAchievements(user.username, function(err, achievement){
			//gets all the filenames of the avatar pictures
			fs.readdir('public\/img\/avatar', function(err, files){
				fs.readdir('public\/uploads\/' + user.username, function(err, scriptFiles){
					res.render('profile', {profile:profile, username:user.username, email:user.email, avatar:user.avatar, pictures:files, scripts: scriptFiles, wins:user.wins, losses:user.losses, ubers: achievement.ubers, ou:achievement.ou, uu:achievement.uu, nu:achievement.nu, lc:achievement.lc});
				});
			});		
		});
	});
  },
  
  login: function(req, res) {
    library.authenticate(req.body.username, req.body.password, function(err, id) {
      if (id) {
        req.session._id = id;
        res.cookie('username', id.username, {username: id.username});
        res.cookie('password', id.password, {password: id.password});
		// Clears associated showdown user on login to prevent people having duplicate showdown usernames.
		library.setShowdownUser(req.session._id, 'null');
        res.redirect('/profile');
      }
      else
        res.redirect('/loginError');
    });    
  },
  
  signup: function(req, res) {
	// Create user
    library.createUser(req.body.username, req.body.email, req.body.password, function(err, user) {
		console.log(user);
		// Create the user's achievements log.
		library.createAchievement(req.body.username, function(err, user) {
			library.authenticate(req.body.username, req.body.password, function(err, id) {
			  if (id) {
				req.session._id = id;
				res.cookie('username', id.username, {username: id.username});
				res.cookie('password', id.password, {password: id.password});
				res.redirect('/profile');
			  }
			  else
				res.redirect('/loginError');
			});  
		});   
    });
  },

  updateEmail: function(req, res) {
    library.mailUpdate(req.session._id, req.body.email, function(err, user) {
      res.redirect('/profile');
  });
  },
  
  updateAvatar: function(req, res) {
    library.avatarUpdate(req.session._id, req.body.avatar, function(err, user) {
      res.redirect('/profile');
  });
  },

  submitFile: function(req, res) {
	// get user for directory name
    library.getUserById(req.session._id, function(err, user) {
	
		var temp_path = req.files.uploadfile.path;
		
		// Check if the user's folder exists; if it doesn't, create it.
		fs.exists('./public/uploads/' + user.username, function(exists){
			if(!exists){ 
				fs.mkdir('./public/uploads/' + user.username, function(err){
					var save_path = './public/uploads/' + user.username + '/' + req.files.uploadfile.name;
					
					fs.rename(temp_path, save_path, function(error){
					  if(error) throw error;
					  
					  fs.unlink(temp_path, function(){
						if(error) throw error;
						res.redirect('/profile');
					  });
					});
				});
			}
			else {
				var save_path = './public/uploads/' + user.username + '/' + req.files.uploadfile.name;
				fs.rename(temp_path, save_path, function(error){
				  if(error) throw error;
				  
				  fs.unlink(temp_path, function(){
					if(error) throw error;
					res.redirect('/profile');
				  });
				});
			}	
		});
	});
  },  
  
  // Called from the showdown client.
  setShowdownName: function(req, res) {
	console.log("showdown user: " + req.body.name);
    library.setShowdownUser(req.session._id, req.body.name);
  },
  
  setWin: function(req, res) {
	library.updateWinLoss(req.body.winner, 'win', req.body.formatName, function(){ 
		res.end('200');
	});
  },
  
  setLoss: function(req, res) {
	library.updateWinLoss(req.body.loser, 'loss', function(){ 
		res.end('200');
	});
  },
  
  getLeaderboard: function(req, res){
	library.getUsers(function(err, users){
		var ratio = [];
		// Get win/loss ratios of all users
		for(i = 0; i < users.length; i++){
			ratio[i] = new Array(2);
			ratio[i][0] = users[i].username;
			if(!(users[i].wins > 0)) users[i].wins = 1;
			if(!(users[i].losses > 0)) users[i].losses = 1;
			ratio[i][1] = users[i].wins/users[i].losses;
		}
		
		// Sort users by win/loss ratio
		function ratioSort(user1, user2){
			if (user1[1] > user2[1]) return 1;
			else if (user2[1] > user1[1]) return -1;
			else return 0;
		}
		ratio.sort(ratioSort);
		ratio.reverse();
		
		//Display top 10 scores
		ratio.length = 10;
		
		res.render('war', {leaderboard: ratio});
	});
  },
  ActionPHP: function(req, resp)
  {
		//decode request
		var request = req.body.request;
		//forward
		jquery.get(request, function(data) {
			resp.send(data); //forward data back
		});
  }

}