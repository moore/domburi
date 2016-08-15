"use strict";

main();

function make10( vdom, mkChildrenw ) {
    var ret = [];
    for ( var i = 0; i < 10; i++ ) {
        var children =  mkChildrenw? mkChildrenw(vdom) : [];
        ret.push(makeNode(vdom, {name:i}, children)); 
    }
    
    return ret;
}

function main( ) {
    var vdom = init();
    var children = make10(vdom, make10);
    var vnode = makeNode( vdom, {name:'a'}, children );
    setRoot( vdom, vnode )

    printVdom( vdom )
}

function printVdom( vdom, ref, padding ) {
    if ( ref === undefined )
        ref = getRoot(vdom);

    if ( padding === undefined )
        padding = "";

    var node = getNode( vdom, ref );
    
    console.log(padding + "::" + node.name);

    var children = getChildren( vdom, ref );

    for ( var i = 0 ; i < children.length ; i++ )
        printVdom( vdom, children[i], padding + "  ");
}

/*
export interface VDom {
    epoc       : number;
    tree       : Segment;
    data       : Array<Segment>;
    root       : number;
    nodes      : Array<Any>;
    freeList   : Array<number>;
}
*/

function makeSegment ( ) {
    var buffer = new ArrayBuffer( 1024 * 1024 );
    return {
        buffer : buffer,
        head   : 0,
        view   : new DataView ( buffer ),
    };
}

function init ( ) {
    var tree  = makeSegment( );
    var data1 = makeSegment( );
    return {
        epoc     : 0,
        tree     : tree,
        data     : [data1],
        root     : -1,
        nodes    : [],
        freeList : [],
    };
}

var REF_OFFSET_BITS = 20;

function refSegment ( ref ) {
    return ref >>> 20;
}

function refOffset ( ref ) {
    return ref && ((1 << REF_OFFSET_BITS ) - 1);
}

function makeRef ( segment, offset ) {
    return (segment << REF_OFFSET_BITS) | offset;
}

var EPOC_SIZE     = 4;
var DATA_REF_SIZE = 4;
var INDEX_SIZE    = 4;
var COUNT_SIZE    = 4;
var TREE_REF_SIZE = 4;
/* -- vtree -- 
[ max epoc EPOC_SIZE ]
[ data ref DATA_REF_SIZE ]
[ child count COUNT_SIZE ]
[ child count * TREE_REF_SIZE ]
*/

function makeNode ( vdom, node, children ) {

    var tree  = vdom.tree;
    var head  = tree.head;
    var space = tree.buffer.length;

    var need = EPOC_SIZE + DATA_REF_SIZE + COUNT_SIZE
        + ( TREE_REF_SIZE * children.length );

    // BUG: deal with wrapping and and GC not just growing.
    while ( ( space - head ) < need ) {
        growSegment( tree );
        space = tree.buffer.length; 
    }
    
    var reference = head;
    var ref       = storeNode( vdom, node );
    var view      = tree.view;

    view.setUint32( head, vdom.epoc       ); head += 4; //EPOC_SIZE;
    view.setUint32( head, ref             ); head += 4; //DATA_REF_SIZE;
    view.setUint32( head, children.length ); head += 4; //COUNT_SIZE;

    for ( var i = 0 ; i < children.length ; i++ ) {
        view.setUint32( head, children[ i ] ); head += 4; //TREE_REF_SIZE;
    }
    
    tree.head = head;

    return reference;
}

/* --vnode--
[ index INDEX_SIZE ]
DOMnode index // many vnodes can have the same dome node but not in a single tree
facts...
*/

function makeVnode ( vdom, node ) {
    
}

function setRoot ( vdom, reference ) {
    vdom.root = reference;
}

function getRoot ( vdom ) {
    return vdom.root;
}

function storeNode( vdom, node ) {
    var index;
    
    if ( vdom.freeList.length == 0 ) {
        index = vdom.nodes.length;
        vdom.nodes.push( node );
    }

    else {
        index = vdom.freeList.pop();
        vdom.nodes[ index ] = node;
    }

    return index;
}

function getNode( vdom, reference ) {
    var index = vdom.tree.view.getUint32(reference + 4); // EPOC_SIZE

    return vdom.nodes[ index ];
}

function getChildren( vdom, reference ) {
    var ret = [];
    var ptr = reference + 4 + 4; // EPOC_SIZE + DATA_REF_SIZE
    var view = vdom.tree.view;
    var count = view.getUint32(ptr); ptr += 4; // COUNT_SIZE
    for ( var i = 0; i < count ; i++ ) {
        var childRef = view.getUint32(ptr); ptr += 4; // TREE_REF_SIZE
        ret.push( childRef )
    }
    
    return ret;
}


function growSegment ( segment ) {
    var length    = segment.buffer.length;
    var newBuffer = new ArrayBuffer( length * 2 );
        
    memcpy( segment.buffer, 0, newBuffer, 0, length );

    vdom.buffer = newBuffer;
    vdom.view   = new DataView( newBuffer );

}

// BUG: feature test for transfer()
// BUG: check that there is space!
function memcpy ( from, fOffset, to, tOffset, length ) {
    var oldInt = Uint32Array( from, fOffset );
    var newInt = Uint32Array( to, tOffset );
    
    for ( var i = 0 ; i < length ; i++ )
        newInt[ i ] = oldInt[ i ];

    return true;
}
