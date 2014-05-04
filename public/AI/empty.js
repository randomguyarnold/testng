(function()
{
	var obj = {
		
		init: function(API) {
			// Allows you to set up your variables at the start of the battle.
			// If you don't want to use it, just leave this function as it is.
		},
		teamPreviewChoice: function(API){
			// Handles team preview (not called for random battles).
			// Return a string with a value from 0 up to 5 corresponding to the Pokemon to start with.

		},
		
		decideMove: function(API) {
			// Decide what to do this turn (either move or switch).
			// Return either a string corresponding to the move made,
			// or a string corresponding to the position of the Pokemon to be switched in, 
			// starting from 1, up to 5 if you're playing Singles. 
			// Your current Pokemon is at position 0 in API.ownTeam.

		},
		handleKnockout: function(API) {
			// Decide which Pokemon to send out next when your current Pokemon gets knocked out.
			// Should return a string corresponding to the position of the Pokemon to be switched in, 
			// starting from 1, up to 5 if you're playing Singles. 
			// Your recently-fainted Pokemon is at position 0 in API.ownTeam.

		}
	}
	return obj;
})()

/*
 * Below is a list of fields and functions that you can access in the API object that is passed into each function.
 * 1) API.getOwnTeam(): returns an array of JSON objects. Each JSON object is a Pokemon on your team.
	  The following are object fields that can be accessed:
		atk
		def
		spa
		spd
		spe 

		atkStat
		defStat
		spaStat
		spdStat
		speStat

		boosts

		hp
		maxhp
		hpcolor
		moves
		ability
		item
		species
		side
		fainted
		zerohp

		status
		statusStage
		volatiles
		turnstatuses
		movestatuses
		lastmove

		name
		species
		id
		statbarElem
*/