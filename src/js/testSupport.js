"use strict";


function main () {

    var template1  = document.getElementById("template1");
    var component1 = Component(template1, ["slot1"]);

    var template2  = document.getElementById("template2");
    var component2 = Component(template2, []);

    var root = document.getElementById("root");

    var components = {
        list: component1,
        li  : component2,
    };
    
    var manager = ManagedDom( root, components );

    var listId = "list-1";

    manager.make( "list", listId );

    manager.mount( "root", "root", listId );
    
    for (var i = 0 ; i < 100 ; i++) {
        var id = "li-"+i
        manager.make("li", id);
        manager.mount( listId, "slot1", id );
    }
}
