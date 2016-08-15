"use strict";

main();

function make10( vdom, mkChildrenw ) {
    var ret = [];
    for ( var i = 0; i < 10; i++ ) {
        var children =  mkChildrenw? mkChildrenw(vdom) : [];
        var ref = makeVnode( vdom, {name:i} );
        ret.push(makeVtree(vdom, ref, children)); 
    }
    
    return ret;
}

function main( ) {
    var vdom = init();
    var children = make10(vdom, make10);
    var ref = makeVnode( vdom, {name:'a'} );
    var vnode = makeVtree( vdom, ref, children );
    setRoot( vdom, vnode )

    printVdom( vdom )
}

function printVdom( vdom, ref, padding ) {
    if ( ref === undefined )
        ref = getRoot(vdom);

    if ( padding === undefined )
        padding = "";
    
    var node = getNodeFromTree( vdom, ref );
    
    console.log("%s::%s", padding, node.name );

    var children = getChildren( vdom, ref );

    for ( var i = 0 ; i < children.length ; i++ )
        printVdom( vdom, children[i], padding + "  ");
}

/*
export interface Segment {
    buffer     : ArrayBuffer;
    head       : number;
    view       : DataView;
}

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
    return ref >>> 20; //REF_OFFSET_BITS
}

function refOffset ( ref ) {
    return ref & ((1 << 20 ) - 1); //REF_OFFSET_BITS
}

function makeRef ( segment, offset ) {
    return (segment << 20) | offset; //REF_OFFSET_BITS
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

function makeVtree ( vdom, ref, children ) {

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
[ epoc EPOC_SIZE ]
[ index INDEX_SIZE ]
DOMnode index // many vnodes can have the same dome node but not in a single tree
facts...
*/

function makeVnode ( vdom, node ) {
    var last    = vdom.data.length - 1;
    var segment = vdom.data[last];
    var head    = segment.head;
    var space   = segment.buffer.length;

    var need = EPOC_SIZE + INDEX_SIZE ; //BOOG: I don't think this works

    // BUG: This is waistfull if a really big node almost fits. 
    if ( ( space - head ) < need ) {
        segment = makeSegment();
        vdom.data.push(segment);
        last++;
        
        head  = segment.head;
        space = segment.buffer.length;

        while ( space < need ) {
            growSegment( segment );
            space = segment.buffer.length;
        }
    }
    
    var offset = head;
    var index  = storeNode( vdom, node );
    var view   = segment.view;
    
    view.setUint32( head, vdom.epoc ); head += 4; //INDEX_SIZE
    view.setUint32( head, index     ); head += 4; //INDEX_SIZE

    segment.head = head;

    var reference = makeRef( last, offset );

    return reference;
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


function getNodeFromTree( vdom, reference ) {
    var vnodeRef = vdom.tree.view.getUint32( reference + 4 );
    return getNode( vdom, vnodeRef );
}

function getNode( vdom, reference ) {
    var segmentIndex  = refSegment( reference );
    var segmentOffset = refOffset( reference );
    
    var index = vdom.data[segmentIndex].view.getUint32(segmentOffset + 4); // EPOC_SIZE

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
