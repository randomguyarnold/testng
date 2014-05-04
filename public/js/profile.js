$(document).ready(function() {
	if (user) {
		$('#logger').attr("href", "/logout")
		$('#logger').children().attr("src", "/img/logout.png")
	};
});