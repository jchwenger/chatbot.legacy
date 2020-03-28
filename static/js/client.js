$(() => {

  const regexStart = /<\|s\|*\>*\n*|<*\|*s\|>\n*/g;
  const regexEnd = /\n<\|e\|*\>*|\n*<*\|*e\|>/g;
  const regexElse = /<\|*|\|*>/;

  let isTyping = false;
  let isGenerating = false;
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
          isGenerating = true;
          disableGenerationButton();
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
          $('<div data-html="true" class="gen-box"></div>').appendTo("#model-output");
          adjustScroll();
        }
      },
      success: function (data) {
        const answer = JSON.parse(data.text);
        // console.log("data:", data);
        // console.log("parsed answer:", answer);
        let callAgain = true;
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
          callAgain = false;
        } else {
          // console.log("generating thru");
          genText = answer.replace(regexElse, "");
          // hack for riddance of \n before char name
          genText = newLineHack(genText);
          // console.log("edited:", genText);
        }

        totalText += genText;
        // console.log("totalText now:", totalText);
        // console.log('-----------------');
        // console.log('generated:');
        // console.log(genText);
        // console.log('-----------------');

        // type only if tab is in focus, otherwise only store the text
        if (!document.hidden && !isTyping) {
          // console.log('document off focus');
          isTyping = true;
          // console.log("is now typing");
          typeWrite(totalText);
        }

        // make another request until the end marker is found
        if (callAgain) {
          const newVals = { "prefix" : "" };
          generate(newVals);
        } else {
          // do this only if found end marker
          isGenerating = false;
          if (!document.hidden && !isTyping) {
            enableGenerationButton();
          }
        }
      },
      error: function (jqXHR, textStatus, errorThrown) {
        logUnderlined("ajax error:");
        console.log(jqXHR);
        console.log(textStatus);
        console.log(errorThrown);
        console.log('-----------------');
        // restore button state
        isGenerating = false;
        enableGenerationButton();
      }
    });
  }

  window.onfocus = (e) => {
    // logUnderlined("on focus again");
    if (textIndex < totalText.length) {
      typeWrite(totalText);
    }
  };

  function typeWrite(txt, speed=100) {
      if (textIndex < txt.length) {
        $(".gen-box:last").append(txt[textIndex].replace('\n', '<br>'));
        adjustScroll();
        textIndex++;
        const rand = (Math.random() + .2) * speed;
        // console.log("char and rand", txt.charAt(textIndex), rand);
        try {
          setTimeout(typeWrite, rand, txt, speed);
        } catch(e) {
        }
      } else {
        // end of typing
        isTyping = false;
        if (!isGenerating) {
          enableGenerationButton();
        }
        // console.log("no longer typing");
      }
    }

  $('#clear-text').click(function (e) {
    $('#prefix').attr('placeholder', "Enfin vous l'emportez, et la faveur du Roi\nVous élève en un rang qui n'était dû qu'à moi,\nIl vous fait Gouverneur du Prince de Castille.");
    e.preventDefault();
    $('#model-output').text('')
    resetTyping();
    clearTimeouts();
    $.ajax({
      type: "GET",
      url: "/"
    });
    enableGenerationButton();
  });

  // https://stackoverflow.com/a/8860203
  function clearTimeouts() {
    let id = window.setTimeout(() => {}, 0);
    console.log('clearing all timeouts/typeWriter calls');
    while (id--) {
      window.clearTimeout(id); // will do nothing if no timeout with id is present
    }
  }

  function resetTyping() {
    totalText = "";
    textIndex = 0;
    console.log(`reset typing, total text now ${totalText}`);
  }

function adjustScroll() {
  document.getElementById('output').scrollTop = document.getElementById('output').scrollHeight;
}

function disableGenerationButton() {
  $('#generate-text').addClass("is-loading");
  $('#generate-text').prop("disabled", true);
}

function enableGenerationButton() {
  $('#generate-text').removeClass("is-loading");
  $('#generate-text').prop("disabled", false);
}

function logUnderlined(msg) {
  console.log(msg);
  console.log('-'.repeat(msg.length));
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
