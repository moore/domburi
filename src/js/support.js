"use strict";

function componentId( index ) {
    return "component-"+index;
}


var Component = new function () {

    return construct;

    function construct ( fTemplate, fSlots ) {

        // Check well formedness.
        for ( var i = 1 ; i <= fSlots ; i++ ) {
            var slot = fTemplate.getElementsByClassName( "slot-"+i );

            if (slot.length !== 1) {
                console.error( "Expected 1 element for slot %s got %s", slot.length, i);
                return undefined;
            }       
        }
        
        var self = {
            build   : build,
            getSlot : getSlot,
        };

        return self;

        function getSlot ( id ) {

        }
        
        function build ( id ) {
            
            var component = fTemplate.cloneNode( true );

            component.id = id;

            for ( var i = 1 ; i <= fSlots ; i++ ) {
                var slotIndex = "slot-"+i;
                var slot      = component.getElementsByClassName( slotIndex );

                if (slot.length !== 1) {
                    console.error( "Template has been mangled!" );
                    return undefined;
                }

                var classList = slot[0].classList;

                classList.remove(slotIndex);
                classList.add( id + "-" + slotIndex );
            }

            return component;
        }
    }
    
};


/*
 * TODO: Implemnt comonent recycleing in make() and free()
 * TODO: Consider grouping mounts on single node using document fragment.
*/
var ManagedDom = new function () {

    return construct;

    function ReadResult ( offset, done ) {
        return {
            offset: offset,
            done  : done,
        };
    }
    
    function construct ( fRoot, fComponentTypes ) {

        var fDecoder         = new TextDecoder('utf-8');
        var fKnownComponents = {};
        var fCommandsGuess   = 10;
        
        var self = {
            readCommands: readCommands,
        };

        return self;
        
        /*
         * stop   : [0x0]
         * make   : [0x1] [4 byte type id] [4 byte node id]
         * mount  : [0x2] [4 byte parentId] [4 byte slotId] [4 byte id] [4 byte beforId]
         * unmount: [0x3] [4 byte id]
         * setText: [0x4] [4 byte id] [4 byte slot id] [4 byte length] [...data...]
         */
        function readCommands ( buffer, offset, budget ) {

            var start    = Date.now();
            var delta    = 0;
            var commands = 0;
            
            var dataView = new DataView( buffer );

            // We try to get each loop to be 10% of budget so we
            // one loop of head room
            budget = budget * 0.9;

            while ( true ) {
                for (var i = 0; i < fCommandsGuess ; i++) {
                    
                    var command = dataView.getUint8(offset); offset += 1;
                    
                    if ( command === 0 ) {
                        // BUG: handle update of fCommandsGuess hear
                        return ReadResult( offset, true );
                    }

                    else if ( command === 1 ) {
                        var typeId = dataView.getUint32(offset); offset += 4; 
                        var nodeId = dataView.getUint32(offset); offset += 4;

                        var result = make( typeId, nodeId );

                        if (result !== true) {
                            console.error("failed to make node, type %s, id %s, at offset %s",
                                          typeId, nodeId, offset);

                            return ReadResult( offset, true );
                        }
                        
                    }

                    else if ( command === 2 ) {
                        var parentId = dataView.getUint32(offset); offset += 4; 
                        var slotId   = dataView.getUint32(offset); offset += 4;
                        var nodeId   = dataView.getUint32(offset); offset += 4;
                        var beforeId = dataView.getInt32(offset);  offset += 4;

                        var result = mount( parentId, slotId, nodeId, beforeId );

                        if (result !== true) {
                            console.error("failed to mount node, id %s, on %s slot %s at offset %s",
                                          nodeId, parentId, slotId, offset);

                            return ReadResult( offset, true );
                        }

                    }

                    else if ( command === 3 ) {
                        var nodeId = dataView.getUint32(offset); offset += 4;

                        var result = unmount( nodeId );

                        if (result !== true) {
                            console.error("failed to unmount node, id %s, at offset %s",
                                          nodeId, offset);

                            return ReadResult( offset, true );
                        }

                    }

                    else if ( command === 4 ) {
                        var nodeId = dataView.getUint32(offset); offset += 4; 
                        var slotId = dataView.getUint32(offset); offset += 4;
                        var length = dataView.getUint32(offset); offset += 4;

                        var data = buffer.slice(offset, offset + length ); offset += length;

                        var text = fDecoder.decode( data );

                        var result = setText( nodeId, slotId, text );
                        
                        if (result !== true) {
                            console.error("failed to set slot text, id %s, slot %s at offset %s, text '%s'",
                                          nodeId, slotId, offset, text);
                            
                            return ReadResult( offset, true );
                        }

                    }
                    
                    else {
                        console.error("undexpected command '%s' at offset %s", command, offset);
                        return ReadResult( offset, true );
                    }
                    

                }

                delta = Date.now() - start
                commands += fCommandsGuess;

                if ( delta >= budget ) {
                    fCommandsGuess = Math.floor(commands * 0.1);
                    break;
                }

            }
            
            return ReadResult( offset, false );
        }

        
        function make ( typeName, index) {
            var factory = fComponentTypes[typeName];

            if (factory === undefined) {
                console.error("Could not find template type '%s'", typeName);
                return false;
            }

            var id = componentId( index );
            
            fKnownComponents[id] = factory.build(id);
            
            return true;
        }

        
        function mount ( parentId, slotIndex, id, beforId ) {

            var slot = getSlot( parentId, slotIndex );

            if ( slot === undefined ) {
                console.error("Could not find slot '%s' '%s'", parentId, slotIndex);
                return false;
            }

            var node = getElement(id);

            if ( node === undefined ) {
                console.error("Could not find component '%s'", id);
                return false;
            }

            if ( beforId < 0 )
                slot.appendChild( node );

            else {
                var before = getElement(beforId);

                if ( before === undefined ) {
                    console.error("Could not find sibling '%s'", beforId);
                    return false;
                }

                // BUG: what happes if before is not in slot?
                slot.insertBefore( node, before );
            }

            return true;
        }

        
        function unmount ( id ) {
            var node = getElement( id );

            if (node === undefined) {
                console.error("Could not unmout unknow component '%s'", id);
                return false;
            }
            
            var parentNode = node.parentNode;

            if ( parentNode !== null )
                parentNode.removeChild(node);

            return true;
        }


        function setText ( id, slotIndex, text ) {

            var slot = getSlot( id, slotIndex );

            if ( slot === undefined ) {
                console.error("Could not find slot '%s' '%s'", id, slotIndex);
                return false;
            }

            // Assume that the firs child is the text we are replaceing
            if( slot.firstChild !== null )
                slot.removeChild(slot.firstChild);

            var textNode = document.createTextNode( text );

            slot.appendChild( textNode );

            return true;
        }
        
        function free ( index ) {
            var id = componentId(index);
            delete fKnownComponents[id];
        }

        
        function getElement ( index ) {
            var id = componentId(index);
            
            var element = fKnownComponents[ id ];

            if ( element === undefined ) {
                var orNull = document.getElementById( id );

                if (orNull !== null) {
                    element = orNull;
                    fKnownComponents[ id ] = element;
                }
            }

            return element;
        }

        
        function getSlot ( index, slotIndex ) {
            var parent = getElement( index );
            
            if ( parent === undefined ) {
                console.error("Could not find parent '%s'", index);
                return undefined;
            }
            
            var id     = componentId(index);
            var slotId = id + "-slot-" + slotIndex;

            var elements = parent.getElementsByClassName( slotId );

            if ( elements.length !== 1 ) {
                console.error("Could not slot id", slotId);
                return undefined;
            }

            return elements[0];
        }
    }
    
};


