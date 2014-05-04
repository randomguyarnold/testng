$(document).ready(function() {
  $('.uname').blur(function(e) {
    $.ajax({type: 'GET', url: '/api/user/' + $('.uname').val()
    }).done(function(found) {
      if (found == '1') {
        $('#imagePlaceHolder').html('<img src="/img/remove.png" alt="cross"> username is already taken');
        $('.create-button').addClass('disabled').attr('disabled', true);
      }
      else {
        $('#imagePlaceHolder').html('<img src="/img/ok.png" alt="tick"> username is available');
        $('.create-button').removeClass('disabled').attr('disabled', false);
      }
    });
  });
});