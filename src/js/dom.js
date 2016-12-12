"use strict";



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

//// Test code ////
function make10A( vdom, depth ) {

    var ret = [];
    for ( var i = 0; i < 10; i++ ) {
        var children =  depth > 0? make10(vdom, depth - 1) : [];
        ret.push(makeVtree(vdom, {name:names[i], facts:{ index : "name-" + i, name:names[i] }}, children)); 
    }
    
    return ret;
}


function make10( vdom, depth ) {
    var ret = [];
    
    for ( var i = 0; i < 10; i++ ) {

        var children = depth > 0 ? make10(vdom, depth - 1) : [];
        
        var name = names[i];

        startVnode(vdom, name);

        addFact( vdom, "index", "name-" + i );
        addFact( vdom, "name", name  );
        
        var vnodeRef = finishVnode( vdom );
        var vtreeRef = startNode( vdom, vnodeRef )

        if ( depth > 0 ) {
            for ( var j = 0 ; j < children.length ; j++ ) {
                addChild( vdom, children[j] )
            }
        }

        ret.push(vtreeRef);
    }

    return ret;
}


function main( ) {
    var start = Date.now();
    var vdom = init();
    startTree( vdom );
    var children = make10(vdom, 3);

    var vnode = makeVtree( vdom,
                           {name:'root', facts:{type: "vdom", version:"1"}},
                           children );
    finishTree( vdom );

    setRoot( vdom, vnode )

    var firstwrite = Date.now();
    
    var vnode2 = makeVtree( vdom,
                            {name:'root2', facts:{type: "vdom", version:"2"}},
                            children );
    finishTree( vdom );

    setRoot( vdom, vnode )

    var secondWrite = Date.now();
    

    var patch = newPatch();

    diff( vdom, patch, vnode, vnode2 );

    var diffed = Date.now();
    
    var iterator = makeFactIterator( vdom );
    var factory  = childIteratorFactory( );
    
    printVdom( vdom, iterator, factory )
    var printed = Date.now();
    console.log("write1 %s, write2 %s, diff %s, print %s, total %s",
                firstwrite  - start,
                secondWrite - firstwrite,
                diffed - secondWrite,
                printed - diffed,
                printed - start);
}


function printVdom( vdom, iterator, factory, ref, padding ) {
    if ( ref === undefined )
        ref = getRoot(vdom);

    if ( padding === undefined )
        padding = "";

    var nodeIndex = readIndex( vdom, ref );
    var tagName   = readTagName( vdom, ref );

    
    //console.log("%s::%s '%s'", padding, nodeIndex, tagName );

    /*
    for ( var count = iterator.init(ref) ; count > 0 ; count = iterator.next() ) {
        console.log("%s  %s=%s", padding, iterator.name(), iterator.value());
    }
    */
    
    var childIterator = getChildIterator( factory, vdom, ref );

    while ( remainingChildren( childIterator ) ) {
        var childRef = nextChild( childIterator );
        printVdom( vdom, iterator, factory, childRef, padding + "  ");
    }

    returnChildIterator( factory, childIterator );
}

//// String <-> ArrayBuffer convertion ////
//Bug: This code only suports ascii
function ab2str (segment, offset, length) {
    var buff  = segment.uint8;
    var result = "";

    for (var i=offset, end= offset +length; i < end; i++) {
        result += String.fromCharCode(buff[i]);
    }

    return result
}

function str2ab(str, segment, offset) {
    var length = str2abLength(str);
    var bufView = segment.uint8

    for (var j=0, i=offset, strLen=offset +str.length; i < strLen; i++, j++) {
        bufView[i] = str.charCodeAt(j);
    }

    return offset + length
}

function str2abLength(str) {
    return str.length;
}


/*
export interface Segment {
    buffer     : ArrayBuffer;
    head       : number;
    view       : DataView;
}
*/
function makeSegment ( ) {
    var buffer = new ArrayBuffer( 1024 * 1024 );
    return {
        buffer : buffer,
        head   : 0,
        view   : new DataView ( buffer ),
        uint8  : new Uint8Array ( buffer ),

        childCountOffset  : 0, //Done
        childCount        : 0, //Done
        currnetNode       : 0,
        factCount         : 0,

    };
}

/*
export interface VDom {
    epoc       : number;
    tree       : Segment;
    data       : Array<Segment>;
    root       : number;
    maxIndex   : number;
    freeList   : Array<number>;
}

*/

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

var EPOC_SIZE         = 4;
var DATA_REF_SIZE     = 4;
var NODE_INDEX_SIZE   = 4;
var COUNT_SIZE        = 4;
var TREE_REF_SIZE     = 4;
var FACT_COUNT_SIZE   = 2;
var FACT_POINTER_SIZE = 4;
/* -- vtree -- 
[ max epoc EPOC_SIZE ]
[ data ref DATA_REF_SIZE ]
[ child count COUNT_SIZE ]
[ child count * TREE_REF_SIZE ]
*/


/*
export interface VDom {
    epoc       : number;
    tree       : Segment;
    data       : Array<Segment>;
    root       : number;
    maxIndex   : number;
    freeList   : Array<number>;
}

*/
function init ( ) {
    return {
        epoc             : 0,
        tree             : undefined,
        data             : [makeSegment( )],
        root             : -1,
        maxIndex         : 0,
        freeList         : [],
        trees            : {},
    };
}

function diff ( vdom, patch, nodeA, nodeB ) {
    var indexA = readIndex( vdom, nodeA );
    var indexB = readIndex( vdom, nodeB );
    var epocA  = readEpoc( vdom, nodeA );
    var epocB  = readEpoc( vdom, nodeB );

    if ( indexA === indexB && epocA === epocB )
        return patch;

    var tagA = readTagName( vdom, nodeA );
    
}

/*
[ node index    4 byte ]
[ parent index  4 byte ]
[ fact count    2 byte ]
[ name len      2 byte ]
[ name bytes    n byte ]
repeated:
[ fact name len 2 byte ]
[ fact name     n byte ]
if delete bit == 0:
[ fact val len  4 byte ]
[ fact val      n byte ]
*/
function newPatch ( ) {
    return makeSegment();
}


function startPatch( segment, name, index ) { //-> void
    var head = segment.head;

    // We set currnetNode so the memcpy in checkDataSpace
    // works right.
    segment.currnetNode = head;
    segment.factCount   = 0;

    var nameLen =  str2abLength(name);
    var need    = NODE_INDEX_SIZE + FACT_COUNT_SIZE
        + FACT_POINTER_SIZE + nameLen;

    checkDataSpace( vdom, need );

    segment = getDataSegment(vdom);
    head    = segment.head;

    var view  = segment.view;
    var index = getNodeIndex( vdom );
    
    view.setUint32( head, vdom.epoc ); head += EPOC_SIZE;
    view.setUint32( head, index     ); head += NODE_INDEX_SIZE;
    view.setUint16( head, 0         ); head += FACT_COUNT_SIZE;
    view.setUint32( head, nameLen   ); head += FACT_POINTER_SIZE;

    head = str2ab(name, segment, head);
    
    segment.head = head;
}

function addFact( vdom, key, value ) { //-> error?
    var keyLen   = str2abLength(key);
    var valueLen = str2abLength(value);
    var need     = 2 *FACT_POINTER_SIZE + keyLen + valueLen;
    
    checkDataSpace( vdom, need, true );

    var segment = getDataSegment(vdom);
    var head    = segment.head;
    var view    = segment.view;

    view.setUint32(head, keyLen); head += FACT_POINTER_SIZE;
    head = str2ab(key, segment, head);
        
    view.setUint32( head, valueLen); head += FACT_POINTER_SIZE;
    head = str2ab(value, segment, head);

    segment.factCount++;
    segment.head = head;
}

function finishVnode( vdom ) {
    var segment   = getDataSegment(vdom);
    var offset    = segment.currnetNode;
    var factCount = segment.factCount;

    if ( factCount != 0 )
        segment.view.setUint16(offset + FACT_COUNT_OFFSET, factCount);

    var last = vdom.data.length - 1;

    segment.factCount = 0;
    
    return makeRef( last, offset );
}


//// Helpers ////
function checkSpace ( vdom, need ) {
    var head  = vdom.tree.head;
    var space = vdom.tree.buffer.byteLength;

    // BUG: deal with wrapping and and GC not just growing.
    while ( ( space - head ) < need ) {
        space = growSegment( vdom.tree );
    }
}

function checkDataSpace ( vdom, need, defaultGrow ) { // -> bool, new segment?
    var segmant = vdom.data[vdom.data.length - 1];
    var head    = segmant.head;
    var space   = segmant.buffer.byteLength;

    if ( defaultGrow === true ) {
        while ( ( space - head ) < need ) {
            space = growSegment( segmant );
        }
        return true;
    }
    var SEGMENT_BUFFER = 1042;
    
    // BUG: This is waistfull if a really big node almost fits. 
    if ( ( space - head ) < ( need + SEGMENT_BUFFER ) ) {
        console.log("add segment");//BOOG
        segmant = makeSegment();
        vdom.data.push( segmant );
        
        head  = segmant.head;
        space = segmant.buffer.length;

        while ( ( space - head ) < need ) {
            space = growSegment( segment );
        }
        return true;
    }
    
    return false;
}

//// END Helpers ////


function startTree ( vdom ) { // -> epoc
    if ( vdom.tree !== undefined )
        vdom.trees[ vdom.epoc ] = vdom.tree;

    vdom.epoc++;
    vdom.tree = makeSegment( );

    return vdom.epoc;
}

function finishTree ( vdom ) {
    finishNode( vdom );
}

function finishNode ( vdom ) {
    var tree = vdom.tree;
    if ( tree.childCountOffset != 0 ) {
        tree.view.setUint32(  tree.childCountOffset,  tree.childCount ); 
        tree.childCount = 0;
        tree.childCountOffset = 0;
    }
}

function startNode( vdom, vnodeRef ) { // -> vtreeRef

    finishNode( vdom );

    var need = EPOC_SIZE + DATA_REF_SIZE + COUNT_SIZE;

    checkSpace( vdom, need );

    var tree     = vdom.tree;
    var head     = tree.head;
    var space    = tree.buffer.length;
    var vtreeRef = head;
    var view     = tree.view;

    view.setUint32( head, vdom.epoc ); head += 4; //EPOC_SIZE;
    view.setUint32( head, vnodeRef  ); head += 4; //DATA_REF_SIZE;
    tree.childCountOffset = head;
    view.setUint32( head, 0         ); head += 4; //COUNT_SIZE;

    tree.head = head;

    return vtreeRef;
}

function addChild( vdom, vtreeRef ) { //-> error?
    checkSpace( vdom, TREE_REF_SIZE );
    
    var tree = vdom.tree;
    tree.childCount++;

    tree.view.setUint32( tree.head, vtreeRef ); tree.head += TREE_REF_SIZE;
}


function makeVtree ( vdom, facts, children ) {

    startVnode( vdom, facts.name );

    var kvs = facts.facts
    var keys = Object.keys(kvs);
    
    keys.sort();

    for ( var i = 0 ; i < keys.length ; i++ ) {
        var key = keys[i];
        addFact( vdom, key, kvs[key] )
    }

    var vnodeRef = finishVnode( vdom );
    
    var vtreeRef = startNode( vdom, vnodeRef )

    for ( var i = 0 ; i < children.length ; i++ ) {
        addChild( vdom, children[i] )
    }

    return vtreeRef;
}

/* --vnode--
[ epoc EPOC_SIZE ]
[ index NODE_INDEX_SIZE ]
DOMnode index // many vnodes can have the same dome node but not in a single tree
facts...
[uint16 fact count]
( sorted by names, all uint32 size )
[name len][tag name]
[key1 len][key1][value1 len][value1]...[keyN len][keyN][valueN len][valueN]
*/


var EPOC_OFFSET = 0;
var NODE_INDEX_OFFSET = EPOC_OFFSET + EPOC_SIZE;
var FACT_COUNT_OFFSET = NODE_INDEX_OFFSET + NODE_INDEX_SIZE;
var FACT_INDEX_OFFSET = FACT_COUNT_OFFSET + FACT_COUNT_SIZE;

function getDataSegment( vdom ) {
    var last = vdom.data.length - 1;

    return vdom.data[last]; 
}

function startVnode( vdom, name ) { //-> void
    var segment = getDataSegment(vdom);
    var head    = segment.head;

    // We set currnetNode so the memcpy in checkDataSpace
    // works right.
    segment.currnetNode = head;
    segment.factCount   = 0;

    var nameLen =  str2abLength(name);
    var need    = EPOC_SIZE + NODE_INDEX_SIZE + FACT_COUNT_SIZE
        + FACT_POINTER_SIZE + nameLen;

    checkDataSpace( vdom, need );

    segment = getDataSegment(vdom);
    head    = segment.head;

    var view  = segment.view;
    var index = getNodeIndex( vdom );
    
    view.setUint32( head, vdom.epoc ); head += EPOC_SIZE;
    view.setUint32( head, index     ); head += NODE_INDEX_SIZE;
    view.setUint16( head, 0         ); head += FACT_COUNT_SIZE;
    view.setUint32( head, nameLen   ); head += FACT_POINTER_SIZE;

    head = str2ab(name, segment, head);
    
    segment.head = head;
}

function addFact( vdom, key, value ) { //-> error?
    var keyLen   = str2abLength(key);
    var valueLen = str2abLength(value);
    var need     = 2 *FACT_POINTER_SIZE + keyLen + valueLen;
    
    checkDataSpace( vdom, need, true );

    var segment = getDataSegment(vdom);
    var head    = segment.head;
    var view    = segment.view;

    view.setUint32(head, keyLen); head += FACT_POINTER_SIZE;
    head = str2ab(key, segment, head);
        
    view.setUint32( head, valueLen); head += FACT_POINTER_SIZE;
    head = str2ab(value, segment, head);

    segment.factCount++;
    segment.head = head;
}

function finishVnode( vdom ) {
    var segment   = getDataSegment(vdom);
    var offset    = segment.currnetNode;
    var factCount = segment.factCount;

    if ( factCount != 0 )
        segment.view.setUint16(offset + FACT_COUNT_OFFSET, factCount);

    var last = vdom.data.length - 1;

    segment.factCount = 0;
    
    return makeRef( last, offset );
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
    return readUint32( vdom, vref, NODE_INDEX_OFFSET );
}

function readEpoc ( vdom, reference ) {
    var vref = getVnodeRef( vdom, reference);
    return readUint32( vdom, vref, EPOC_OFFSET );
}


function readTagName ( vdom, reference ) {
    var vref      = getVnodeRef( vdom, reference);
    var factCount = getFactCount( vdom, vref );
    var segment   = getSegment( vdom, vref );

    var segmentOffset = refOffset( vref );
    var offset        = segmentOffset + FACT_INDEX_OFFSET;
    var tagStart      = offset + FACT_POINTER_SIZE;
    var len           = segment.view.getUint32(offset)

    var tag = ab2str(segment, tagStart, len);

    return tag;
}

function readFactOffset ( vdom, vref, index ) {
    return readUint32( vdom, vref, FACT_INDEX_OFFSET
                       + index * FACT_POINTER_SIZE);
}

function makeFactIterator ( vdom ) {
    var fVref          = undefined;
    var fCount         = 0;
    var fTcurrnetIndex = 0;
    var fSegment       = undefined;
    var fOffset        = 0;
    var fName          = undefined;
    var fValue         = undefined;
    
    var iterator = {
        init      : init,
        next      : next,
        remaining : remaining,
        name      : name,
        value     : value,
    };

    return iterator;

    function init ( reference ) {
        fVref          = getVnodeRef( vdom, reference );
        fCount         = getFactCount( vdom, fVref );
        fTcurrnetIndex = 0;
        fSegment       = getSegment( vdom, fVref );
        fOffset        = refOffset( fVref ) + FACT_INDEX_OFFSET;

        // Read past tag name
        fOffset = stringAdvance(fOffset);
        
        next();
        //console.log("fCount %s", fCount); //BOOG
        return fCount;
    }

    function next ( ) {
        //console.log("+nest fTcurrnetIndex %s", fTcurrnetIndex);
        if (remaining() > 0) {
            fTcurrnetIndex++;

            fName   = factString(fOffset);
            fOffset = stringAdvance(fOffset);
            fValue  = factString(fOffset);
            fOffset = stringAdvance(fOffset);
        }
        //console.log("-nest fTcurrnetIndex %s remaining %s", fTcurrnetIndex, remaining());

        return remaining();
    }
    
    function remaining ( ) {
        return fCount - fTcurrnetIndex + 1;
    }
    
    function name ( ) {
        return fName;
    }

    function value ( ) {
        return fValue;
    }
    
    function factString( offset ) {
        var start = offset + FACT_POINTER_SIZE;
        var len   = fSegment.view.getUint32(offset);
        return ab2str(fSegment, start, len);
    }

    function stringAdvance( offset ) {
        return offset
            + fSegment.view.getUint32(offset)
            + FACT_POINTER_SIZE;
    }

}

function readUint32( vdom, vref, offset ) {    
    var segment = getSegment( vdom, vref );
    var segmentOffset = refOffset( vref );

    return segment.view.getUint32(segmentOffset + offset );
}

function getFactCount( vdom, vref ) {
    var segment = getSegment( vdom, vref );
    var segmentOffset = refOffset( vref );
    
    return segment.view.getUint16(segmentOffset + FACT_COUNT_OFFSET);
}

function getVnodeRef( vdom, reference ) {
   return vdom.tree.view.getUint32( reference + EPOC_SIZE );
}

function getSegment( vdom, vref ) {
    var segmentIndex  = refSegment( vref );
    
    return vdom.data[segmentIndex];
}


function childIteratorFactory ( ) {
    
    return {
        free : [],
    };
}

function getChildIterator ( factory, vdom, reference ) {
    var iterator = undefined;

    if ( factory.free.length === 0 )
        iterator = { count : 0, index : 0, view : undefined, pointer : undefined  };
    else 
        iterator = factory.free.pop();

    var pointer = reference + EPOC_SIZE + DATA_REF_SIZE;
    var view    = vdom.tree.view;
    var count   = view.getUint32(pointer); pointer += COUNT_SIZE;

    iterator.count   = count;
    iterator.index   = 0;
    iterator.view    = view;
    iterator.pointer = pointer;
    
    return iterator;
}

function returnChildIterator ( factory, iterator ) {
    factory.free.push( iterator );
}


function remainingChildren ( iterator ) {
    return iterator.count - iterator.index;
}


function nextChild ( iterator ) {

    var result = iterator.view.getUint32(iterator.pointer);
    
    if ( iterator.count  > iterator.index ) {
        iterator.index++;
        iterator.pointer += TREE_REF_SIZE;
    }
    
    return result;
}

function growSegment ( segment ) {
    console.log("growSegment...."); //BOOG
    var length    = segment.buffer.byteLength;
    var newBuffer = new ArrayBuffer( length * 2 );
        
    memcpy( segment.buffer, 0, newBuffer, 0, length );

    segment.buffer = newBuffer;
    segment.view   = new DataView( newBuffer );
    segment.uint8  = new Uint8Array( newBuffer ); 

    return newBuffer.length
}

// BUG: feature test for transfer()
// BUG: check that there is space!
function memcpy ( from, fOffset, to, tOffset, length ) {
    var oldInt = new Uint32Array( from, fOffset );
    var newInt = new Uint32Array( to, tOffset );
    
    for ( var i = 0 ; i < length ; i++ )
        newInt[ i ] = oldInt[ i ];

    return true;
}


main();
