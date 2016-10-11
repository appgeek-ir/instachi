function hello() {
  console.log("hello");
  chrome.runtime.sendMessage({
      action: "Update"
    },
    function (response) {
      document.getElementById("div").textContent = response.msg;
    });
}
var i = 0;
window.onload = function () {
  document.getElementById("div").textContent = i++;
  document.getElementById("btn").onclick = function (e) {
    hello();
  }

}

function showSection(id) {
  $('section.active').removeClass('active');
  $('section' + id).addClass('active');
}

var port = chrome.extension.connect({
  name: "popup"
});

var instaext = {
  ActivationStatus: function (msg) {
    if (msg.result) {
      port.postMessage({
        action: "LoginStatus"
      });
    } else {
      showSection('#activation');
    }
  },
  LoginStatus: function (msg) {
    if (msg.result) {
      showSection('#main');
    } else {
      showSection('#login');
    }
  }

};

port.onMessage.addListener(function (msg) {
  if (msg.action != undefined && msg.action != null) {
    if (msg.action.indexOf("Callback.") == 0) {
      instaext[msg.action.split('.')[1]].apply(instaext, [msg]);
    } else {

    }
  }
});

//initialize
Zepto(function ($) {

  $('a.button-return').on('click', function (e) {
    e.preventDefault();
    showSection('#main');
  });

  $("section#main a").on('click', function (e) {
    e.preventDefault();
    var $this = $(this);
    showSection($this.prop('target'));
  });

  $('#follow-pattern').on('change', function (e) {
    var $this = $(this);
    $('#follow-pattern-manual').toggle($this.val() == 'manual');
    $('#follow-pattern-auto').toggle($this.val() == 'auto');
  });

  //get activation status
  port.postMessage({
    action: "ActivationStatus"
  });
  //get login status
})