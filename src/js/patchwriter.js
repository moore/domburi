"use strict";

var PatchWriter = new function () {

    var fEncoder = new TextEncoder();
    
    return construct;

    /*
     * stop   : [0x0]
     * make   : [0x1] [4 byte type id] [4 byte node id]
     * mount  : [0x2] [4 byte parentId] [4 byte slotId] [4 byte id] [4 byte beforId]
     * unmount: [0x3] [4 byte id]
     * setText: [0x4] [4 byte id] [4 byte slot id] [4 byte length] [...data...]
     */
    function construct ( fBuffer, fOfset ) { 

        fOfset |= 0; // unjustified optimisation.
        
        var fDataView = new DataView (fBuffer);
        
        return {
            stop    : stop,
            make    : make,
            mount   : mount,
            unmount : unmount,
            setText : setText,
        };

        function stop ( ) {
            fDataView.setUint8(fOfset, 0); fOfset += 1;

            return fOfset;
        }

        function make ( typeId, nodeId ) {
            fDataView.setUint8(fOfset, 1); fOfset += 1;
            fDataView.setUint32(fOfset, typeId); fOfset += 4;
            fDataView.setUint32(fOfset, nodeId); fOfset += 4;

            return fOfset;
        }

        function mount ( parentId, slotId, nodeId, beforIndex ) {
            if (beforIndex === undefined )
                beforIndex = -1;

            fDataView.setUint8(fOfset, 2); fOfset += 1;
            fDataView.setUint32(fOfset, parentId);   fOfset += 4;
            fDataView.setUint32(fOfset, slotId);     fOfset += 4;
            fDataView.setUint32(fOfset, nodeId);     fOfset += 4;
            fDataView.setInt32(fOfset, beforIndex);  fOfset += 4;

            return fOfset;
        }

        function unmount ( nodeId ) {
            fDataView.setUint8(fOfset, 3); fOfset += 1;
            fDataView.setUint32(fOfset, nodeId);     fOfset += 4;

            return fOfset;

        }

        function setText ( nodeId, slotId, text ) {
            fDataView.setUint8(fOfset, 4); fOfset += 1;
            fDataView.setUint32(fOfset, nodeId);     fOfset += 4;
            fDataView.setUint32(fOfset, slotId);     fOfset += 4;

            var data = fEncoder.encode(text);

            var length = data.byteLength;
            
            fDataView.setUint32(fOfset, length); fOfset += 4;

            for ( var i = 0 ; i < length ; i++ ) {
                fDataView.setUint8(fOfset, data[i]); fOfset += 1;
            }
            
            return fOfset;

        }
    }
    
};
