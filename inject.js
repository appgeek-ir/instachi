
var requests = {};
var _send = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.send = function() {
               
    /* Wrap onreadystaechange callback */
    var callback = this.onreadystatechange;
    this.onreadystatechange = function() {
         if (this.readyState == 4) {
             /* We are in response; do something, like logging or anything you want */
             //console.log("response:"+this.responseText);
             if(this._callback!=undefined){
                 this._callback(this.status,this.responseText);
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
    if(requests[this._url]!==undefined){
        this._callback = requests[this._url];
        delete requests[this._url];
    }
    _open.apply(this,arguments);
}

window.RegisterRequest = function(url,callback){
    requests[url] = callback;
}

window.GetViewerUsername = function(id){
    var username = window._sharedData.config.viewer.username;
    document.getElementById(id).innerText = username;
}