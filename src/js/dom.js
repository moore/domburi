"use strict";


//// String <-> ArrayBuffer convertion ////
//Bug: This code only suports code points in the frist two pages
//     so not big 5
function ab2str (segment, offset, length) {
    // BUG: I don't understand why deviding by Uint16Array.BYTES_PER_ELEMENT works?
    // I thought this was suposed to be in bytes not elements!
    return String.fromCharCode.apply(null, new Uint16Array(segment.buffer, offset, length/Uint16Array.BYTES_PER_ELEMENT));
}

function str2ab(str, segment, offset) {
    var length = str2abLength(str);
    var bufView = new Uint16Array(segment.buffer, offset, length);

    for (var i=0, strLen=str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }

    return offset + length
}

function str2abLength(str) {
    return str.length * Uint16Array.BYTES_PER_ELEMENT;
}


//// Test code ////
function make10( vdom, mkChildrenw ) {
    var names = {
        0: "zero",
        1: "one",
        2: "two",
        3: "three",
        4: "four",
        5: "five",
        6: "six",
        7: "seven",
        8: "eight",
        9: "nine",
    };

    var ret = [];
    for ( var i = 0; i < 10; i++ ) {
        var children =  mkChildrenw? mkChildrenw(vdom) : [];
        ret.push(makeVtree(vdom, {name:names[i], facts:{}}, children)); 
    }
    
    return ret;
}

function main( ) {
    var vdom = init();
    var children = make10(vdom, make10);
    var vnode = makeVtree( vdom, {name:'a', facts:{}}, children );
    setRoot( vdom, vnode )

    printVdom( vdom )
}

function printVdom( vdom, ref, padding ) {
    if ( ref === undefined )
        ref = getRoot(vdom);

    if ( padding === undefined )
        padding = "";
    
    var nodeIndex = readIndex( vdom, ref );
    var tagName   = readTagName( vdom, ref )
    
    console.log("%s::%s '%s'", padding, nodeIndex, tagName );

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
        maxIndex : 0,
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

function makeVtree ( vdom, facts, children ) {

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

    var ref = makeVnode( vdom, facts );

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
facts... ( format repeated hear for conveaonce )
[uint16 fact count]
( sorted by names, all uint32 size )
[tag name end][name1 end][value1 end]...[nameN end][valueN end]
[ ... fact data ... ]

*/

function makeVnode ( vdom, node ) {
    var last    = vdom.data.length - 1;
    var segment = vdom.data[last];
    var head    = segment.head;
    var space   = segment.buffer.length;

    var need = EPOC_SIZE + INDEX_SIZE + factsLength( node.name, node.facts );

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
    var index  = getNodeIndex( vdom );
    var view   = segment.view;
    
    view.setUint32( head, vdom.epoc ); head += 4; //INDEX_SIZE
    view.setUint32( head, index     ); head += 4; //INDEX_SIZE

    head = writeFacts(node.name, node.facts, segment, head);
    
    segment.head = head;

    var reference = makeRef( last, offset );

    return reference;
}

/* -- facts -- 
Note: We could have a uint 8 in hear that would
tell us if we needed to use non ascii chars and
use different widths for the data.
Note: We could figure out the total length and pick the end pointer
size appropetly.
[uint16 fact count]
( sorted by names, all uint32 size )
[tag name end][name1 end][value1 end]...[nameN end][valueN end]
[ ... fact data ... ]
*/
var FACT_COUNT_SIZE   = 2;
var FACT_POINTER_SIZE = 4;

function factsLength( tag, facts ) {

    var length = FACT_COUNT_SIZE
        + FACT_POINTER_SIZE
        + str2abLength(tag);

    var keys = Object.keys(facts);

    length += keys.length * FACT_POINTER_SIZE * 2;

    for ( var i = 0 ; i < keys.length ; i++ ) {
        var key = keys[i];
        length += str2abLength(key);
        length += str2abLength(facts[key]);
    }

    return length;
}

function writeFacts(tag, facts, segment, offset) {
    var view = segment.view
    var indexOffset = offset + FACT_COUNT_SIZE;
    var keys = Object.keys(facts);

    keys.sort();
    
    offset += FACT_COUNT_SIZE + FACT_POINTER_SIZE
        + keys.length * FACT_POINTER_SIZE * 2;

    offset = str2ab(tag, segment, offset);

    view.setUint32(indexOffset, offset)
    indexOffset += FACT_POINTER_SIZE;

    for ( var i = 0 ; i < keys.length ; i++ ) {
        var key = keys[i];
        offset = str2ab(key, segment, offset);

        view.setUint32(indexOffset, offset)
        indexOffset += FACT_POINTER_SIZE;

        offset = str2ab(facts[key], segment, offset);
        buffer.setUint32(indexOffset, offset)
        indexOffset += FACT_POINTER_SIZE;
    }

    return offset
}



function setRoot ( vdom, reference ) {
    vdom.root = reference;
}

function getRoot ( vdom ) {
    return vdom.root;
}

function getNodeIndex ( vdom ) {
    var index;
    
    if ( vdom.freeList.length == 0 ) {
        vdom.maxIndex += 1;
        index = vdom.maxIndex;
    }

    else {
        index = vdom.freeList.pop();
    }

    return index;
}


function readIndex ( vdom, reference ) {
    var vref = getVnodeRef( vdom, reference);
    return readUint32( vdom, vref, EPOC_SIZE );
}
 
function readTagName ( vdom, reference ) {
    var vref = getVnodeRef( vdom, reference);
    var tagEnd = readUint32( vdom, vref, EPOC_SIZE + INDEX_SIZE + FACT_COUNT_SIZE );
    var factCount = getFactCount( vdom, vref );
    var segmentOffset = refOffset( vref );
    var tagStart = segmentOffset + EPOC_SIZE + INDEX_SIZE + FACT_COUNT_SIZE + FACT_POINTER_SIZE + factCount * FACT_POINTER_SIZE;
    var segment = getSegment( vdom, vref );
    var tag = ab2str(segment, tagStart, tagEnd - tagStart);

    return tag;
}

function readUint32( vdom, vref, offset ) {    
    var segment = getSegment( vdom, vref );
    var segmentOffset = refOffset( vref );
    
    return segment.view.getUint32(segmentOffset + offset );
}

function getFactCount( vdom, vref ) {
    var segment = getSegment( vdom, vref );
    var segmentOffset = refOffset( vref );
    
    return segment.view.getUint16(segmentOffset + EPOC_SIZE + INDEX_SIZE );
}

function getVnodeRef( vdom, reference ) {
   return vdom.tree.view.getUint32( reference + EPOC_SIZE );
}

function getSegment( vdom, vref ) {
    var segmentIndex  = refSegment( vref );
    
    return vdom.data[segmentIndex];
}


function getChildren( vdom, reference ) {
    var ret = [];
    var ptr = reference + EPOC_SIZE + DATA_REF_SIZE;
    var view = vdom.tree.view;
    var count = view.getUint32(ptr); ptr += COUNT_SIZE;
    for ( var i = 0; i < count ; i++ ) {
        var childRef = view.getUint32(ptr); ptr += TREE_REF_SIZE;
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


main();
