// Function to trigger the PDA Dialog box
window.openPDA = function() {
    Dialog.setup("SURVIVOR PDA", "pda-dialog");
    Dialog.wiki(Story.get("PDA_Overlay").text);
    Dialog.open();
};

// Bind the TAB key (or 'I' for inventory) to open/close the menu instantly
$(document).on('keyup', function (e) {
    if (e.key === 'Tab') {
        e.preventDefault(); // Prevents the browser from tabbing to links
        
        // If a dialog is already open, close it. Otherwise, open the PDA.
        if ($("#ui-dialog-dialog").is(":visible")) {
            Dialog.close();
        } else {
            window.openPDA();
        }
    }
});