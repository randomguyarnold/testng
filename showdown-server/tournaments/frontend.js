require('es6-shim');

var TournamentGenerators = {
	roundrobin: require('./generator-round-robin.js').RoundRobin,
	elimination: require('./generator-elimination.js').Elimination
};

exports.tournaments = {};

function usersToNames(users) {
	return users.map(function (user) { return user.name; });
}

function createTournamentGenerator(generator, args, output) {
	var Generator = TournamentGenerators[toId(generator)];
	if (!Generator) {
		output.sendReply(generator + " is not a valid type.");
		output.sendReply("Valid types: " + Object.keys(TournamentGenerators).join(", "));
		return;
	}
	args.unshift(null);
	return new (Generator.bind.apply(Generator, args));
}
function createTournament(room, format, generator, isRated, args, output) {
	if (room.type !== 'chat') {
		output.sendReply("Tournaments can only be created in chat rooms.");
		return;
	}
	if (exports.tournaments[room.id]) {
		output.sendReply("A tournament is already running in the room.");
		return;
	}
	if (Rooms.global.lockdown) {
		output.sendReply("The server is restarting soon, so a tournament cannot be created.");
		return;
	}
	if (Tools.getFormat(format).effectType !== 'Format') {
		output.sendReply(format + " is not a valid format.");
		output.sendReply("Valid formats: " + Object.keys(Tools.data.Formats).filter(function (f) { return Tools.data.Formats[f].effectType === 'Format'; }).join(", "));
		return;
	}
	if (!TournamentGenerators[toId(generator)]) {
		output.sendReply(generator + " is not a valid type.");
		output.sendReply("Valid types: " + Object.keys(TournamentGenerators).join(", "));
		return;
	}
	return exports.tournaments[room.id] = new Tournament(room, format, createTournamentGenerator(generator, args, output), isRated);
}
function deleteTournament(name, output) {
	var id = toId(name);
	var tournament = exports.tournaments[id];
	if (!tournament)
		output.sendReply(name + " doesn't exist.");
	tournament.forceEnd(output);
	delete exports.tournaments[id];
}
function getTournament(name, output) {
	var id = toId(name);
	if (exports.tournaments[id])
		return exports.tournaments[id];
}

var Tournament = (function () {
	function Tournament(room, format, generator, isRated) {
		this.room = room;
		this.format = toId(format);
		this.generator = generator;
		this.isRated = isRated;

		this.isBracketInvalidated = true;
		this.bracketCache = null;

		this.isTournamentStarted = false;
		this.availableMatches = null;
		this.inProgressMatches = null;

		this.isAvailableMatchesInvalidated = true;
		this.availableMatchesCache = null;

		this.pendingChallenges = null;

		room.add('|tournament|create|' + this.format + '|' + generator.name);
		room.send('|tournament|update|' + JSON.stringify({
			format: this.format,
			generator: generator.name,
			isStarted: false,
			isJoined: false
		}));
		this.update();
	}

	Tournament.prototype.setGenerator = function (generator, output) {
		if (this.isTournamentStarted) {
			output.sendReply('|tournament|error|BracketFrozen');
			return;
		}

		var isErrored = false;
		this.generator.getUsers().forEach(function (user) {
			var error = generator.addUser(user);
			if (typeof error === 'string') {
				output.sendReply('|tournament|error|' + error);
				isErrored = true;
			}
		});

		if (isErrored)
			return;

		this.generator = generator;
		this.room.send('|tournament|update|' + JSON.stringify({generator: generator.name}));
		this.isBracketInvalidated = true;
		this.update();
	};

	Tournament.prototype.forceEnd = function () {
		if (this.isTournamentStarted)
			this.inProgressMatches.forEach(function (match) {
				if (match)
					delete match.room.win;
			});
		this.room.add('|tournament|forceend');
	};

	Tournament.prototype.update = function (targetUser) {
		if (targetUser && (this.isBracketInvalidated || (this.isTournamentStarted && this.isAvailableMatchesInvalidated))) {
			this.room.add("Error: update() called with a target user when data invalidated: " + this.isBracketInvalidated + ", " + (this.isTournamentStarted && this.isAvailableMatchesInvalidated) + "; Please report this to an admin.");
			return;
		}

		if (targetUser) {
			var isJoined = this.generator.getUsers().indexOf(targetUser) >= 0;
			targetUser.sendTo(this.room, '|tournament|update|' + JSON.stringify({
				format: this.format,
				generator: this.generator.name,
				isStarted: this.isTournamentStarted,
				isJoined: isJoined,
				bracketData: this.bracketCache
			}));
			if (this.isTournamentStarted && isJoined) {
				targetUser.sendTo(this.room, '|tournament|update|' + JSON.stringify({
					challenges: usersToNames(this.availableMatchesCache.challenges.get(targetUser)),
					challengeBys: usersToNames(this.availableMatchesCache.challengeBys.get(targetUser))
				}));

				var pendingChallenge = this.pendingChallenges.get(targetUser);
				if (pendingChallenge && pendingChallenge.to)
					targetUser.sendTo(this.room, '|tournament|update|' + JSON.stringify({challenging: pendingChallenge.to.name}));
				else if (pendingChallenge && pendingChallenge.from)
					targetUser.sendTo(this.room, '|tournament|update|' + JSON.stringify({challenged: pendingChallenge.from.name}));
			}
		} else {
			if (this.isBracketInvalidated) {
				this.bracketCache = this.getBracketData();
				this.isBracketInvalidated = false;
				this.room.send('|tournament|update|' + JSON.stringify({bracketData: this.bracketCache}));
			}

			if (this.isTournamentStarted && this.isAvailableMatchesInvalidated) {
				this.availableMatchesCache = this.getAvailableMatches();
				this.isAvailableMatchesInvalidated = false;

				this.availableMatchesCache.challenges.forEach(function (opponents, user) {
					user.sendTo(this.room, '|tournament|update|' + JSON.stringify({challenges: usersToNames(opponents)}));
				}, this);
				this.availableMatchesCache.challengeBys.forEach(function (opponents, user) {
					user.sendTo(this.room, '|tournament|update|' + JSON.stringify({challengeBys: usersToNames(opponents)}));
				}, this);
			}
		}
		this.room.send('|tournament|updateEnd', targetUser);
	};

	Tournament.prototype.purgeGhostUsers = function () {
		// "Ghost" users sometimes end up in the tournament because they've merged with another user.
		// This function is to remove those ghost users from the tournament.
		this.generator.getUsers().forEach(function (user) {
			var realUser = Users.getExact(user.userid);
			if (!realUser || realUser !== user)
				// The two following functions are called without their second argument,
				// but the second argument will not be used in this situation
				if (this.isTournamentStarted) {
					if (!this.disqualifiedUsers.get(user))
						this.disqualifyUser(user);
				} else
					this.removeUser(user);
		}, this);
	};

	Tournament.prototype.addUser = function (user, isAllowAlts, output) {
		if (!isAllowAlts) {
			var users = {};
			this.generator.getUsers().forEach(function (user) { users[user.name] = 1; });
			var alts = user.getAlts();
			for (var a = 0; a < alts.length; ++a)
				if (users[alts[a]]) {
					output.sendReply('|tournament|error|AltUserAlreadyAdded');
					return;
				}
		}

		var error = this.generator.addUser(user);
		if (typeof error === 'string') {
			output.sendReply('|tournament|error|' + error);
			return;
		}

		this.room.add('|tournament|join|' + user.name);
		user.sendTo(this.room, '|tournament|update|{"isJoined":true}');
		this.isBracketInvalidated = true;
		this.update();
	};
	Tournament.prototype.removeUser = function (user, output) {
		var error = this.generator.removeUser(user);
		if (typeof error === 'string') {
			output.sendReply('|tournament|error|' + error);
			return;
		}

		this.room.add('|tournament|leave|' + user.name);
		user.sendTo(this.room, '|tournament|update|{"isJoined":false}');
		this.isBracketInvalidated = true;
		this.update();
	};
	Tournament.prototype.replaceUser = function (user, replacementUser, output) {
		var error = this.generator.replaceUser(user, replacementUser);
		if (typeof error === 'string') {
			output.sendReply('|tournament|error|' + error);
			return;
		}

		this.room.add('|tournament|replace|' + user.name + '|' + replacementUser.name);
		user.sendTo(this.room, '|tournament|update|{"isJoined":false}');
		replacementUser.sendTo(this.room, '|tournament|update|{"isJoined":true}');
		this.isBracketInvalidated = true;
		this.update();
	};

	Tournament.prototype.getBracketData = function () {
		var data = this.generator.getBracketData();
		if (data.type === 'tree' && data.rootNode) {
			var queue = [data.rootNode];
			while (queue.length > 0) {
				var node = queue.shift();

				if (node.state === 'available') {
					var pendingChallenge = this.pendingChallenges.get(node.children[0].team);
					if (pendingChallenge && node.children[1].team === pendingChallenge.to)
						node.state = 'challenging';

					var inProgressMatch = this.inProgressMatches.get(node.children[0].team);
					if (inProgressMatch && node.children[1].team === inProgressMatch.to) {
						node.state = 'inprogress';
						node.room = inProgressMatch.room.id;
					}
				}

				if (node.team)
					node.team = node.team.name;

				node.children.forEach(function (child) {
					queue.push(child);
				});
			}
		} else if (data.type === 'table') {
			if (this.isTournamentStarted)
				data.tableContents.forEach(function (row, r) {
					var pendingChallenge = this.pendingChallenges.get(data.tableHeaders.rows[r]);
					var inProgressMatch = this.inProgressMatches.get(data.tableHeaders.rows[r]);
					if (pendingChallenge || inProgressMatch)
						row.forEach(function (cell, c) {
							if (!cell)
								return;

							if (pendingChallenge && data.tableHeaders.cols[c] === pendingChallenge.to)
								cell.state = 'challenging';

							if (inProgressMatch && data.tableHeaders.cols[c] === inProgressMatch.to) {
								cell.state = 'inprogress';
								cell.room = inProgressMatch.room.id;
							}
						});
				}, this);
			data.tableHeaders.cols = usersToNames(data.tableHeaders.cols);
			data.tableHeaders.rows = usersToNames(data.tableHeaders.rows);
		}
		return data;
	};

	Tournament.prototype.startTournament = function (output) {
		if (this.isTournamentStarted) {
			output.sendReply('|tournament|error|AlreadyStarted');
			return;
		}

		this.purgeGhostUsers();
		if (this.generator.getUsers().length < 2) {
			output.sendReply('|tournament|error|NotEnoughUsers');
			return;
		}

		this.generator.freezeBracket();

		this.availableMatches = new Map();
		this.inProgressMatches = new Map();
		this.pendingChallenges = new Map();
		this.disqualifiedUsers = new Map();
		var users = this.generator.getUsers();
		users.forEach(function (user) {
			var availableMatches = new Map();
			users.forEach(function (user) {
				availableMatches.set(user, false);
			});
			this.availableMatches.set(user, availableMatches);
			this.inProgressMatches.set(user, null);
			this.pendingChallenges.set(user, null);
			this.disqualifiedUsers.set(user, false);
		}, this);

		this.isTournamentStarted = true;
		this.isBracketInvalidated = true;
		this.room.add('|tournament|start');
		this.room.send('|tournament|update|{"isStarted":true}');
		this.update();
	};
	Tournament.prototype.getAvailableMatches = function () {
		var matches = this.generator.getAvailableMatches();
		if (typeof matches === 'string') {
			this.room.add("Unexpected error from getAvailableMatches(): " + error + ". Please report this to an admin.");
			return;
		}

		var users = this.generator.getUsers();
		var challenges = new Map();
		var challengeBys = new Map();

		users.forEach(function (user) {
			challenges.set(user, []);
			challengeBys.set(user, []);

			var availableMatches = this.availableMatches.get(user);
			users.forEach(function (user) {
				availableMatches.set(user, false);
			});
		}, this);

		matches.forEach(function (match) {
			challenges.get(match[0]).push(match[1]);
			challengeBys.get(match[1]).push(match[0]);

			this.availableMatches.get(match[0]).set(match[1], true);
		}, this);

		return {
			challenges: challenges,
			challengeBys: challengeBys
		};
	};

	Tournament.prototype.disqualifyUser = function (user, output) {
		var isTournamentEnded = this.generator.disqualifyUser(user);
		if (typeof isTournamentEnded === 'string') {
			output.sendReply('|tournament|error|' + isTournamentEnded);
			return;
		}
		if (this.disqualifiedUsers.get(user)) {
			output.sendReply('|tournament|error|AlreadyDisqualified');
			return;
		}

		this.disqualifiedUsers.set(user, true);
		this.generator.setUserBusy(user, false);

		var challenge = this.pendingChallenges.get(user);
		if (challenge) {
			this.pendingChallenges.set(user, null);
			if (challenge.to) {
				this.generator.setUserBusy(challenge.to, false);
				this.pendingChallenges.set(challenge.to, null);
				challenge.to.sendTo(this.room, '|tournament|update|{"challenged":null}');
			} else if (challenge.from) {
				this.generator.setUserBusy(challenge.from, false);
				this.pendingChallenges.set(challenge.from, null);
				challenge.from.sendTo(this.room, '|tournament|update|{"challenging":null}');
			}
		}

		var matchFrom = this.inProgressMatches.get(user);
		if (matchFrom) {
			this.generator.setUserBusy(matchFrom.to, false);
			this.inProgressMatches.set(user, null);
			delete matchFrom.room.win;
			matchFrom.room.forfeit(user);
		}

		var matchTo = null;
		this.inProgressMatches.forEach(function (match, userFrom) {
			if (match && match.to === user)
				matchTo = userFrom;
		});
		if (matchTo) {
			this.generator.setUserBusy(matchTo, false);
			var matchRoom = this.inProgressMatches.get(matchTo).room;
			delete matchRoom.win;
			matchRoom.forfeit(user);
			this.inProgressMatches.set(matchTo, null);
		}

		this.room.add('|tournament|disqualify|' + user.name);
		user.sendTo(this.room, '|tournament|update|{"isJoined":false}');
		this.isBracketInvalidated = true;
		this.isAvailableMatchesInvalidated = true;

		if (isTournamentEnded)
			this.onTournamentEnd();
		else
			this.update();
	};

	Tournament.prototype.challenge = function (from, to, output) {
		if (!this.isTournamentStarted) {
			output.sendReply('|tournament|error|NotStarted');
			return;
		}

		if (!this.availableMatches.get(from) || !this.availableMatches.get(from).get(to)) {
			output.sendReply('|tournament|error|InvalidMatch')
			return;
		}

		if (this.generator.getUserBusy(from) || this.generator.getUserBusy(to)) {
			this.room.add("Tournament backend breaks specifications. Please report this to an admin.");
			return;
		}

		this.generator.setUserBusy(from, true);
		this.generator.setUserBusy(to, true);

		this.isAvailableMatchesInvalidated = true;
		this.purgeGhostUsers();
		this.update();

		from.prepBattle(this.format, 'challenge', from, this.finishChallenge.bind(this, from, to, output));
	};
	Tournament.prototype.finishChallenge = function (from, to, output, result) {
		if (!result) {
			this.generator.setUserBusy(from, false);
			this.generator.setUserBusy(to, false);

			this.isAvailableMatchesInvalidated = true;
			this.update();
			return;
		}

		this.pendingChallenges.set(from, {to: to, team: from.team});
		this.pendingChallenges.set(to, {from: from, team: from.team});
		from.sendTo(this.room, '|tournament|update|' + JSON.stringify({challenging: to.name}));
		to.sendTo(this.room, '|tournament|update|' + JSON.stringify({challenged: from.name}));

		this.isBracketInvalidated = true;
		this.update();
	};
	Tournament.prototype.cancelChallenge = function (user, output) {
		if (!this.isTournamentStarted) {
			output.sendReply('|tournament|error|NotStarted');
			return;
		}

		var challenge = this.pendingChallenges.get(user);
		if (!challenge || challenge.from)
			return;

		this.generator.setUserBusy(user, false);
		this.generator.setUserBusy(challenge.to, false);
		this.pendingChallenges.set(user, null);
		this.pendingChallenges.set(challenge.to, null);
		user.sendTo(this.room, '|tournament|update|{"challenging":null}');
		challenge.to.sendTo(this.room, '|tournament|update|{"challenged":null}');

		this.isBracketInvalidated = true;
		this.isAvailableMatchesInvalidated = true;
		this.update();
	};
	Tournament.prototype.acceptChallenge = function (user, output) {
		if (!this.isTournamentStarted) {
			output.sendReply('|tournament|error|NotStarted');
			return;
		}

		var challenge = this.pendingChallenges.get(user);
		if (!challenge || !challenge.from)
			return;

		user.prepBattle(this.format, 'challenge', user, this.finishAcceptChallenge.bind(this, user, challenge));
	};
	Tournament.prototype.finishAcceptChallenge = function (user, challenge, result) {
		if (!result)
			return;
		if (!this.pendingChallenges.get(user))
			// Prevent double accepts
			return;

		var room = Rooms.global.startBattle(challenge.from, user, this.format, this.isRated, challenge.team, user.team);
		if (!room) return;

		this.pendingChallenges.set(challenge.from, null);
		this.pendingChallenges.set(user, null);
		challenge.from.sendTo(this.room, '|tournament|update|{"challenging":null}');
		user.sendTo(this.room, '|tournament|update|{"challenged":null}');

		this.inProgressMatches.set(challenge.from, {to: user, room: room});
		this.room.add('|tournament|battlestart|' + challenge.from.name + '|' + user.name + '|' + room.id);

		this.isBracketInvalidated = true;
		this.update();

		var self = this;
		room.win = function (winner) {
			self.onBattleWin(this, Users.get(winner));
			return Object.getPrototypeOf(this).win.call(this, winner);
		};
	};
	Tournament.prototype.onBattleWin = function (room, winner) {
		var from = Users.get(room.p1);
		var to = Users.get(room.p2);

		var result = 'draw';
		if (from === winner)
			result = 'win';
		else if (to === winner)
			result = 'loss';

		if (result === 'draw' && !this.generator.isDrawingSupported) {
			this.room.add('|tournament|battleend|' + from.name + '|' + to.name + '|' + result + '|' + room.battle.score.join(',') + '|fail');

			this.generator.setUserBusy(from, false);
			this.generator.setUserBusy(to, false);
			this.inProgressMatches.set(from, null);

			this.isBracketInvalidated = true;
			this.isAvailableMatchesInvalidated = true;

			this.update();
			return;
		}

		var isTournamentEnded = this.generator.setMatchResult([from, to], result, room.battle.score);
		if (typeof isTournamentEnded === 'string') {
			// Should never happen
			this.room.add("Unexpected " + isTournamentEnded + " from setMatchResult() in onBattleWin(" + room.id + ", " + winner.userid + "). Please report this to an admin.");
			return;
		}

		this.room.add('|tournament|battleend|' + from.name + '|' + to.name + '|' + result + '|' + room.battle.score.join(','));

		this.generator.setUserBusy(from, false);
		this.generator.setUserBusy(to, false);
		this.inProgressMatches.set(from, null);

		this.isBracketInvalidated = true;
		this.isAvailableMatchesInvalidated = true;

		if (isTournamentEnded)
			this.onTournamentEnd();
		else
			this.update();
	};
	Tournament.prototype.onTournamentEnd = function () {
		this.room.add('|tournament|end|' + JSON.stringify({results: this.generator.getResults().map(usersToNames), bracketData: this.getBracketData()}));
		delete exports.tournaments[toId(this.room.id)];
	};

	return Tournament;
})();

var commands = {
	basic: {
		j: 'join',
		in: 'join',
		join: function (tournament, user) {
			tournament.addUser(user, false, this);
		},
		l: 'leave',
		out: 'leave',
		leave: function (tournament, user) {
			tournament.removeUser(user, this);
		},
		getupdate: function (tournament, user) {
			tournament.update(user);
		},
		challenge: function (tournament, user, params, cmd) {
			if (params.length < 1)
				return this.sendReply("Usage: " + cmd + " <user>");
			var targetUser = Users.get(params[0]);
			if (!targetUser)
				return this.sendReply("User " + params[0] + " not found.");
			tournament.challenge(user, targetUser, this);
		},
		cancelchallenge: function (tournament, user) {
			tournament.cancelChallenge(user, this);
		},
		acceptchallenge: function (tournament, user) {
			tournament.acceptChallenge(user, this);
		}
	},
	creation: {
		settype: function (tournament, user, params, cmd) {
			if (params.length < 1)
				return this.sendReply("Usage: " + cmd + " <type> [, <comma-separated arguments>]");
			var generator = createTournamentGenerator(params.shift(), params, this);
			if (generator)
				tournament.setGenerator(generator, this);
		},
		begin: 'start',
		start: function (tournament) {
			tournament.startTournament(this);
		}
	},
	moderation: {
		dq: 'disqualify',
		disqualify: function (tournament, user, params, cmd) {
			if (params.length < 1)
				return this.sendReply("Usage: " + cmd + " <user>");
			var targetUser = Users.get(params[0]);
			if (!targetUser)
				return this.sendReply("User " + params[0] + " not found.");
			tournament.disqualifyUser(targetUser, this);
		},
		end: 'delete',
		stop: 'delete',
		delete: function (tournament) {
			deleteTournament(tournament.room.title, this);
		}
	}
};

CommandParser.commands.tour = 'tournament';
CommandParser.commands.tours = 'tournament';
CommandParser.commands.tournaments = 'tournament';
CommandParser.commands.tournament = function (paramString, room, user) {
	var cmdParts = paramString.split(' ');
	var cmd = cmdParts.shift().trim().toLowerCase();
	var params = cmdParts.join(' ').split(',').map(function (param) { return param.trim(); });

	if (cmd === '') {
		if (!this.canBroadcast()) return;
		this.sendReply('|tournaments|info|' + JSON.stringify(Object.keys(exports.tournaments).filter(function (tournament) {
			tournament = exports.tournaments[tournament];
			return !tournament.room.isPrivate && !tournament.room.staffRoom;
		}).map(function (tournament) {
			tournament = exports.tournaments[tournament];
			return {room: tournament.room.title, format: tournament.format, generator: tournament.generator.name, isStarted: tournament.isTournamentStarted};
		})));
	} else if (cmd === 'help') {
		if (!this.canBroadcast()) return;
		return this.sendReplyBox(
			"- create/new &lt;format>, &lt;type> [, &lt;comma-separated arguments>]: Creates a new tournament in the current room.<br />" +
			"- settype &lt;type> [, &lt;comma-separated arguments>]: Modifies the type of tournament after it's been created, but before it has started.<br />" +
			"- end/stop/delete: Forcibly ends the tournament in the current room.<br />" +
			"- begin/start: Starts the tournament in the current room.<br />" +
			"- dq/disqualify &lt;user>: Disqualifies a user.<br />" +
			"More detailed help can be found <a href=\"https://gist.github.com/kotarou3/7872574\">here</a>"
		);
	} else if (cmd === 'create' || cmd === 'new') {
		if (!user.can('tournaments', null, room))
			return this.sendReply(cmd + " -  Access denied.");
		if (params.length < 2)
			return this.sendReply("Usage: " + cmd + " <format>, <type> [, <comma-separated arguments>]");

		createTournament(room, params.shift(), params.shift(), Config.istournamentsrated, params, this);
	} else {
		var tournament = getTournament(room.title);
		if (!tournament)
			return this.sendReply("There is currently no tournament running in this room.");

		var commandHandler = null;
		if (commands.basic[cmd])
			commandHandler = typeof commands.basic[cmd] === 'string' ? commands.basic[commands.basic[cmd]] : commands.basic[cmd];

		if (commands.creation[cmd]) {
			if (!user.can('tournaments', null, room))
				return this.sendReply(cmd + " -  Access denied.");
			commandHandler = typeof commands.creation[cmd] === 'string' ? commands.creation[commands.creation[cmd]] : commands.creation[cmd];
		}

		if (commands.moderation[cmd]) {
			if (!user.can('tournamentsmoderation', null, room))
				return this.sendReply(cmd + " -  Access denied.");
			commandHandler = typeof commands.moderation[cmd] === 'string' ? commands.moderation[commands.moderation[cmd]] : commands.moderation[cmd];
		}

		if (!commandHandler)
			this.sendReply(cmd + " is not a tournament command.");
		else
			commandHandler.call(this, tournament, user, params, cmd);
	}
};

exports.Tournament = Tournament;
exports.TournamentGenerators = TournamentGenerators;

exports.createTournament = createTournament;
exports.deleteTournament = deleteTournament;
exports.get = getTournament;

exports.commands = commands;
