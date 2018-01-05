"use strict";


function main () {

    var template1  = document.getElementById("template1");
    var component1 = Component(template1, 1);

    var template2  = document.getElementById("template2");
    var component2 = Component(template2, 1);

    var root = document.getElementById("root");

    var components = {
        1: component1,
        2: component2,
    };
    
    var manager = ManagedDom( root, components );

    var nextId = 7;
    var listId = nextId++;
    var rootId = 0;

    var buffer = new ArrayBuffer(1000000);
    var offset = 0;
    var writer = PatchWriter(buffer, offset);

    writer.make( 1, listId );
        
    writer.mount( rootId, 1, listId );
    
    for (var i = 0 ; i < 100 ; i++) {
        var id = nextId++;
        writer.make(2, id);
        writer.setText(id, 1, "Text for item "+id);
        writer.mount( listId, 1, id );
    }

    writer.stop();
    
    manager.readCommands(buffer, offset);
}
