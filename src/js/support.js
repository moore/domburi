"use strict";


var Component = new function () {

    return construct;

    function construct ( fTemplate, fSlots ) {

        // Check well formedness.
        for ( var i = 0 ; i < fSlots.length ; i++ ) {
            var slot = fTemplate.getElementsByClassName( fSlots[i] );

            if (slot.length !== 1) {
                console.error( "Expected 1 element for slot %s got %s", slot.length,  fSlots[i]);
                return undefined;
            }       
        }

        
        var self = {
            build : build,
        };

        return self;

        function build ( id ) {

            var component = fTemplate.cloneNode( true );

            component.id = id;

            for ( var i = 0 ; i < fSlots.length ; i++ ) {
                var slotName = fSlots[i];
                var slot     = component.getElementsByClassName( slotName );

                if (slot.length !== 1) {
                    console.error( "Template has been mangled!" );
                    return undefined;
                }

                slot[0].classList.add( id + "-" + slotName );
            }

            return component;
        }
    }
    
};



var ManagedDom = new function () {

    return construct;

    function construct ( fRoot, fComponentTypes ) {

        var fKnownComponents = {};
        
        var self = {
            make    : make,
            mount   : mount,
            unmount : unmount,
        };

        return self;


        function make ( typeName, id ) {
            var factory = fComponentTypes[typeName];

            if (factory === undefined) {
                console.error("Could not find template type '%s'", typeName);
                return false;
            }
                
            fKnownComponents[id] = factory.build(id);
            
            return true;
        }

        
        function mount ( parentId, slotName, id, beforId ) {

            var slot = getSlot( parentId, slotName );

            if ( slot === undefined ) {
                console.error("Could not find slot '%s' '%s'", parentId, slotName);
                return false;
            }

            var node = getElement(id);

            if ( node === undefined ) {
                console.error("Could not find component '%s'", id);
                return false;
            }

            if ( beforId === undefined )
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

        
        function free ( id ) {
            delete fKnownComponents[id];
        }

        
        function getElement ( id ) {
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

        
        function getSlot ( parentId, slotName ) {
            var parent = getElement( parentId );
            
            if ( parent === undefined ) {
                console.error("Could not find parent '%s'", parentId);
                return undefined;
            }
            
            var slotId = parentId + "-" + slotName;

            var elements = parent.getElementsByClassName( slotId );

            if ( elements.length !== 1 ) {
                console.error("Could not slot id", slotId);
                return undefined;
            }

            return elements[0];
        }
    }
    
};


