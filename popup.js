document.getElementById("btn").onclick = function(e){
  hello();
}

function hello() {
  console.log("hello");
  chrome.runtime.sendMessage({
      action: "Update"
    },
    function(response) {
      document.getElementById("div").textContent = response.msg;
    });
}
var i =0;
window.onload = function(){
  document.getElementById("div").textContent = i++;
}