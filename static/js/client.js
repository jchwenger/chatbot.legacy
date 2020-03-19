$(() => {

  const regexStart = /<\|s\|*\>*\n*|<*\|*s\|>\n*/g;
  const regexEnd = /\n<\|e\|*\>*|\n*<*\|*e\|>/g;
  const regexElse = /<\|*|\|*>/;

  $('#gen-form').submit(function (e) {
    e.preventDefault();
    const vals = getInputValues();
    // console.log('vals:', vals);
    generate(vals);

  });

  function generate(vals) {
    $.ajax({
      type: "POST",
      url: "/",
      dataType: "json",
      data: JSON.stringify(vals),
      beforeSend: function (data) {
        // character given only on form submit
        if (vals.hasOwnProperty('character')) {
          // diable generate button
          $('#generate-text').addClass("is-loading");
          $('#generate-text').prop("disabled", true);
          $('#tutorial').remove();
          // print user input to output screen
          const chrct = `<div>${vals.character}</div>`;
          const blather = vals.prefix.replace(/\n\n/g, "<div><br></div>").replace(/\n/g, "<div></div>");
          const prompt = `<div class="gen-box-right">${chrct}${blather}</div>`
          $(prompt).appendTo('#model-output').hide().fadeIn("slow");
          // make suggestions actual text if they weren't, empty prefix box
          $('#character').val($('#character').attr('placeholder'));
          $('#prefix').val('');
          $('#prefix').attr('placeholder', '');
          // create empty div to receive our answer
          $('<div class="gen-box"></div>').appendTo("#model-output");
        }
      },
      success: function (data) {
        const answer = JSON.parse(data.text);
        console.log("data:", data);
        console.log("parsed answer:", answer);
        let recall = true;
        let gentext = "";
        testStart = regexStart.test(answer);
        console.log("test start", testStart);
        if (testStart) {
          console.log("regex start found");
          gentext = answer
            .replace(regexStart, "")
            .replace(/\n/g, "<br>");
          gentext = newLineHack(gentext);
          console.log("edited:", gentext);
        } else if (regexEnd.test(answer)) {
          console.log("regex end found");
          regexEnd.lastIndex = 0; // reset index
          gentext = answer.substring(0, regexEnd.exec(answer).index);
          gentext = gentext.replace(/\n/g, "<br>");
          console.log("edited:", gentext);
          recall = false;
        } else {
          console.log("generating thru");
          gentext = answer
            .replace(regexElse, "");
          // hack for riddance of \n before char name
          gentext = newLineHack(gentext);
          console.log("edited:", gentext);
        }

        $(".gen-box:last").append(gentext);

        if (recall) {
          const newVals = { "prefix" : "" };
          generate(newVals);
        } else {
          // do this only if found end marker
          $('#generate-text').removeClass("is-loading");
          $('#generate-text').prop("disabled", false);
        }
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.log("ajax error:");
        console.log(jqXHR);
        console.log(textStatus);
        console.log(errorThrown);

        // restore button state
        $('#generate-text').removeClass("is-loading");
        $('#generate-text').prop("disabled", false);
        // $('#tutorial').remove();
        // const html = '<div class="gen-box warning">There was an error generating the text! Please try again!</div><div class="gen-border"></div>';
        // $(html).appendTo('#model-output').hide().fadeIn("slow");
      }
    });
  }

  function newLineHack(gentext) {
    // hack for riddance of \n before char name
    if (gentext == gentext.toUpperCase()) {
      console.log('(gentext upper case trick)');
      gentext = gentext.replace(/^\n/, "")
        .replace(/\n/g, "<br>");
    } else {
      console.log('(no gentext upper case trick)');
      gentext = gentext.replace(/\n/g, "<br>");
    }
    return gentext;
  }
  $('#clear-text').click(function (e) {
    $('#prefix').attr('placeholder', "Enfin vous l'emportez, et la faveur du Roi\nVous élève en un rang qui n'était dû qu'à moi,\nIl vous fait Gouverneur du Prince de Castille.");
    e.preventDefault();
    $('#model-output').text('')
    $.ajax({
      type: "GET",
      url: "/"
    });
  });

});

function getInputValues() {
  const inputs = {};
  $("textarea, input").each(function () {
    const v = $(this).val();
    if (v){
      inputs[$(this).attr('id')] = $(this).val();
    } else {
      inputs[$(this).attr('id')] = $(this).attr('placeholder');
    }
  });
  return inputs;
}

// Make sure this code gets executed after the DOM is loaded.
document.querySelectorAll("#prefix,#character").forEach(el => {
  el.addEventListener("keyup", event => {
    if (event.key == "Enter" && event.ctrlKey) {
      document.querySelector("#generate-text").click();
      return;
    }
  })
});