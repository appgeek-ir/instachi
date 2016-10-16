
var requests = {};
var _send = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function() {
               
    /* Wrap onreadystaechange callback */
    var callback = this.onreadystatechange;
    this.onreadystatechange = function() {
         if (this.readyState == 4) {
             /* We are in response; do something, like logging or anything you want */
             //console.log("response:"+this.responseText);
             if(this._id!=undefined){
                 var data = {};
                 if(this.status==200){
                     data = JSON.parse(this.responseText);
                 }
                 document.getElementById(this._id).innerText = JSON.stringify({status:this.status,data:data});
             }  
         }

         if(callback!==null){ 
             callback.apply(this, arguments);
         }
    }
    _send.apply(this, arguments);
}

var _open = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function() {
    this._url = arguments.length>1?arguments[1]:null;
    console.log(this._url);
    if(requests[this._url]!==undefined){
        this._id = requests[this._url];
        delete requests[this._url];
    }
    _open.apply(this,arguments);
}

window.registerRequest = function(id,url){
    requests[url] = id;
}

window.getViewerUsername = function(id){
    var username = window._sharedData.config.viewer.username;
    document.getElementById(id).innerText = username;
}
window.getViewer = function(id){
    var user = window._sharedData.config.viewer;
    document.getElementById(id).innerText  = JSON.stringify(user);
}

window.getProfile = function(id){
    if(window._sharedData.entry_data.ProfilePage==undefined){
        document.getElementById(id).innerText  = 'null';
    }else{
        var user = window._sharedData.entry_data.ProfilePage[0].user;
        document.getElementById(id).innerText  = JSON.stringify(user);
    }

}

console.log('file injected!');
