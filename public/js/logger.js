$(document).ready(function() {
	if (user!=undefined) {
		$('#logger').attr("href", "/logout")
		$('#logger').children().attr("src", "/img/logout2.png")
		//document.getElementById('buttonText') = 'logout';
	};
});