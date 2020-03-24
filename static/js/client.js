$(() => {

  const regexStart = /<\|s\|*\>*\n*|<*\|*s\|>\n*/g;
  const regexEnd = /\n<\|e\|*\>*|\n*<*\|*e\|>/g;
  const regexElse = /<\|*|\|*>/;

  let isTyping = false;
  let textIndex = 0;
  let totalText = "";

  $('#gen-form').submit(function (e) {
    e.preventDefault();
    const vals = getInputValues();
    // console.log('vals:', vals);
    resetTyping();
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
          // print user input to output screen
          const chrct = `<div>${vals.character}</div>`;
          const blather = vals.prefix.replace(/\n\n/g, "<div><br></div>").replace(/\n/g, "<div></div>");
          const prompt = `<div class="gen-box-right">${chrct}${blather}</div>`
          $(prompt).appendTo('#model-output').hide().fadeIn("slow");
          // make suggestions actual text if they weren't, empty prefix box
          if (!$('#character').val()) {
            $('#character').val($('#character').attr('placeholder'));
          }
          $('#prefix').val('');
          $('#prefix').attr('placeholder', '');
          // create empty div to receive our answer
          $('<div class="gen-box"></div>').appendTo("#model-output");
          adjustScroll();
        }
      },
      success: function (data) {
        const answer = JSON.parse(data.text);
        // console.log("data:", data);
        // console.log("parsed answer:", answer);
        let recall = true;
        let genText = "";
        testStart = regexStart.test(answer);
        // console.log("test start", testStart);
        if (testStart) {
          // console.log("regex start found");
          genText = answer.replace(regexStart, "");
          genText = newLineHack(genText);
          // console.log("edited:", genText);
        } else if (regexEnd.test(answer)) {
          // console.log("regex end found");
          regexEnd.lastIndex = 0; // reset index
          genText = answer.substring(0, regexEnd.exec(answer).index);
          // console.log("edited:", genText);
          recall = false;
        } else {
          // console.log("generating thru");
          genText = answer.replace(regexElse, "");
          // hack for riddance of \n before char name
          genText = newLineHack(genText);
          // console.log("edited:", genText);
        }

        totalText += genText;
        // console.log("totalText now:", totalText);
        console.log(genText);
        if (!isTyping) {
          isTyping = true;
          // console.log("is now typing");
          typeWrite(totalText);
        }

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
      }
    });
  }

  function typeWrite(txt, speed=100) {
    if (textIndex < txt.length) {
      $(".gen-box:last").append(txt[textIndex].replace('\n', "<br>"));
      adjustScroll();
      textIndex++;
      const rand = (Math.random() + .2) * speed;
      // console.log("char and rand", txt.charAt(textIndex), rand);
      try {
        setTimeout(typeWrite, rand, txt, speed);
      } catch(e) {
      }
    } else {
      isTyping = false;
      // console.log("no longer typing");
    }
  }

  function resetTyping() {
    console.log("resetting typing");
    totalText = "";
    textIndex = 0;
  }

  function adjustScroll() {
    document.getElementById('output').scrollTop = document.getElementById('output').scrollHeight;
  }

  function newLineHack(genText) {
    // hack for riddance of \n before char name
    if (genText == genText.toUpperCase()) {
      // console.log('(genText upper case trick)');
      genText = genText.replace(/^\n/, "");
    } else {
      // console.log('(no genText upper case trick)');
    }
    return genText;
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
