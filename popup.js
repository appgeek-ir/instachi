var currentSection,
  templates = {},
  callbacks = {},
  port = chrome.extension.connect({
    name: "popup"
  });

/**
 * دریافت پاسخ از پس زمینه
 */
port.onMessage.addListener(function (msg) {
  if (msg.action != undefined &&
    msg.action != null) {
    if (msg.action.indexOf('callback.') == 0) {
      var action = msg.action.split('.')[1];
      if (callbacks[action] !== undefined) {
        callbacks[action](msg);
        delete callbacks[action];
      }
    } else {
      // فعلن از پس زمینه تابعی فراخوانی نمی شود
    }
  }
});
// functions

/**
 * ارسال پیام به پس زمینه
 */
function postMessage(msg, callback) {
  callbacks[msg.action] = callback;
  port.postMessage(msg);
}

/**
 * لود کردن کنترلر مربوطه
 */
function loadCtrl(ctrl) {
  console.log(ctrl);
  if (window[ctrl] !== undefined) {
    window[ctrl].init();
  }
}

/**
 * نمایش تمپلیت
 */
function showTemplate(id) {
  $('section#error').hide();
  currentSection = id;
  if (templates[id] == undefined) {
    templates[id] = doT.template($('#' + id + '-template').html());
  }
  var $main = $('section#main');
  $main.html(templates[id]({}));
}

/**
 * نمایش خطا
 */
function error(msg) {
  $('section#error').show();
  $('section#error>div').text(msg);
}

/**
 * clog
 */
function clog(){
  for(var i in arguments){
    console.log(arguments[i]);
  }
}


// منوی اصلی
var mainCtrl = {
  init: function () {
    postMessage({
      action: 'activationStatus'
    }, $.proxy(this.activationStatusReponse, mainCtrl));
  },
  initMain: function () {
    $('section#main').find('a').on('click', function (e) {
      e.preventDefault();
      var $this = $(this);
      loadCtrl($this.prop('target'));
    });
  },
  initActivation: function () {

  },
  activationStatusReponse: function (msg) {
    if (msg.result) {
      postMessage({
        action: 'loginStatus'
      }, $.proxy(this.loginStatusResponse, mainCtrl));
    } else {
      showTemplate('activation');
      this.initActivation();
    }
  },
  loginStatusResponse: function (msg) {
    if (msg.result) {
      showTemplate('main');
      this.initMain();
    } else {
      showTemplate('login');
    }
  }
}
window['mainCtrl'] = mainCtrl;

// فالو
window['followCtrl'] = {

  currentPage: null,
  init: function () {
    this.currentPage = null;
    postMessage({
      action: 'getCurrentPage'
    }, $.proxy(this.getCurrentPageResponse, this));

    showTemplate('follow');
    var $main = $('section#main'),
      that = this;
    $main.find('a.button-return').on('click', function (e) {
      e.preventDefault();
      loadCtrl('mainCtrl');
    });
    $main.find('button').on('click', function(e){
      that.createTask();
    });

    $('#follow-pattern').on('change', function (e) {
      var $this = $(this);
      $('#follow-pattern-manual').toggle($this.val() == 'manual');
      $('#follow-pattern-auto').toggle($this.val() == 'auto');
    });
  },
  createTask: function () {
    var patternType = $('#follow-pattern').val(),
      pattern,
      msg = {
        action: "createTask",
        type: "Follow",
        checkFollowHistory: $('#follow-not-frequent').is(':checked'),
        checkFollowStatus: $('#follow-not-followers').is(':checked'),
        startType: $('#follow-task-start').val(),
        count: $('#follow-count').val()
      };

    if (patternType == 'auto') {
      pattern = $('#follow-pattern-auto').val();
      if (pattern == null || pattern == undefined) {
        clog('follow pattern not selected');
        error('روش فالو کردن را انتخاب نمایید!');
        return;
      }
    } else {
      if (this.currentPage == null) {
        clog('current page is not fetched');
        error('امکان فالو کردن از طریق صفحه جاری امکان پذیر نمی باشد');
        return;
      }
      msg.username = this.currentPage;
      pattern = $('#follow-pattern-manual').val();
    }

    msg.patternType = patternType;
    msg.pattern = pattern;
    console.log('create task request');
    postMessage(msg, $.proxy(this.createTaskResponse, followCtrl));
  },
  createTaskResponse: function (msg) {
    if (msg.result) {
      showTemplate('tasks');
    } else {
      error(msg.message);
    }
  },
  getCurrentPageResponse: function (msg) {
    console.log('get current page response:');
    console.log(msg);
    if (msg.result) {
      this.currentPage = msg.username;
    }
  }
}

/**
 * کنترلر آنفالو
 */
window['unfollowCtrl'] = {

  /**
   * راه اندازی
   */
  init: function () {

    showTemplate('unfollow');
    var $main = $('section#main'),
      that = this;
    $main.find('a.button-return').on('click', function (e) {
      e.preventDefault();
      loadCtrl('mainCtrl');
    });
    $main.find('button').on('click', function(e){
      that.createTask();
    });

  },

  /**
   * تولید وظیفه آنفالو
   */
  createTask: function(){
      msg = {
        action: 'createTask',
        type: 'Unfollow',
        pattern: $('#unfollow-pattern').val(),
        checkFollowStatus: $('#unfollow-not-followers').is(':checked'),
        startType: $('#unfollow-task-start').val(),
        order: $('#unfollow-order').val(),
        count: $('#unfollow-count').val()
      };

    clog('create unfollow task request');
    postMessage(msg, $.proxy(this.createTaskResponse, this));
  },
  createTaskResponse: function(msg){
    clog('create unfollow task response:',msg);
    showTemplate('tasks');
  }
};

window['tasksCtrl'] = {


  init: function(){

  },

}

//initialize
Zepto(function ($) {

  loadCtrl('mainCtrl');

})
