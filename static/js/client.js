$(() => {

  const regexStart = /<\|s\|*\>*\n*|<*\|*s\|>\n*/g;
  const regexEnd = /\n<\|e\|*\>*|\n*<*\|*e\|>/g;
  const regexElse = /<\|*|\|*>/;

  let isTyping = false;
  let isGenerating = false;
  let autoScroll = true;

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

          let charInjunc = $('#character-injunction').val()
          if ($('#character-injunction').val()) {
            charInjunc += "<br>";
          }
          // create empty div to receive our answer
          $(`<div data-html="true" class="gen-box">${charInjunc}</div>`)
            .appendTo("#model-output")
            .promise().done(adjustScroll());

          // if holding a value, store that in the placeholder during generation
          if ($('#theme-injunction').val()) {
            $('#theme-injunction').attr('placeholder', $('#theme-injunction').val());
          }
          if ($('#character-injunction').val()) {
            $('#character-injunction').attr('placeholder', $('#character-injunction').val());
          }
          if ($('#prefix-injunction').val()) {
            $('#prefix-injunction').attr('placeholder', $('#prefix-injunction').val());
          }

          // riddance of values so we send those only at the start of generation
          $('#theme-injunction').val('')
          $('#character-injunction').val('');
          $('#prefix-injunction').val('');
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
          // console.log('document in focus');
          // console.log("is now typing");
          isTyping = true;
          typeWrite();
        }

        // make another request until the end marker is found
        if (callAgain) {
          const newVals = { "prefix" : "" };
          generate(newVals);
        } else {
          // do this only if found end marker
          isGenerating = false;
          // if generation ends after typing
          // console.log('finished generation');
          if (!document.hidden && !isTyping) {
            // console.log('& no typing');
            enableGenerationButton();

            // restore placeholders to values for the next round
            $('#theme-injunction').val($('#theme-injunction').attr('placeholder'));
            $('#character-injunction').val($('#character-injunction').attr('placeholder' ));
            $('#prefix-injunction').val($('#prefix-injunction').attr('placeholder' ));

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
      typeWrite();
    }
  };

  // if scroll at bottom of output container, enable autoscroll
  document.getElementById('output').onscroll = (e) => {
    // console.log('output scrolled: disabling autoscroll');
    autoScroll = false;
    const outTop = document.getElementById('output').scrollTop;
    const outMax = document.getElementById('output').scrollTopMax;
    if (outTop == outMax) {
      // console.log('back to the bottom: reenabling autoscroll');
      autoScroll = true;
    }
  };

  function typeWrite(speed=100) {
      if (textIndex < totalText.length) {
        $(".gen-box:last").append(totalText[textIndex].replace('\n', '<br>'))
          .promise().done(() => {
            if (autoScroll) adjustScroll();
          });
        textIndex++;
        const rand = (Math.random() + .2) * speed;
        // console.log("char and rand", totalText.charAt(textIndex), rand);
        try {
          setTimeout(typeWrite, rand, speed);
        } catch(e) {
          // error caused by last step of recursion
          // console.log(e);
        }
      } else {
        // end of typing
        // console.log(`finished typing, text index: ${textIndex}, total length ${totalText.length}`);
        isTyping = false;
        // if typing stops after generation
        if (!isGenerating) {
          enableGenerationButton();

          // restore placeholders to values for the next round
          $('#theme-injunction').val($('#theme-injunction').attr('placeholder'));
          $('#character-injunction').val($('#character-injunction').attr('placeholder' ));
          $('#prefix-injunction').val($('#prefix-injunction').attr('placeholder' ));

        }
      }
    }

  $('#clear-text').click(function (e) {
    e.preventDefault();
    $.ajax({
      type: "GET",
      url: "/",
      beforeSend: () => {
        disableGenerationButton();
        $('#prefix').attr('placeholder', "Enfin vous l'emportez, et la faveur du Roi\nVous élève en un rang qui n'était dû qu'à moi,\nIl vous fait Gouverneur du Prince de Castille.");
        $('#model-output').text('')

        // riddance of it all
        $('#theme-injunction').attr('placeholder', '');
        $('#character-injunction').attr('placeholder', '');
        $('#prefix-injunction').attr('placeholder', '');

        $('#theme-injunction').val('')
        $('#character-injunction').val('');
        $('#prefix-injunction').val('');

        resetTyping();
        clearTimeouts();
      },
      success: () => {
        enableGenerationButton();
      }
    });
  });

  // https://stackoverflow.com/a/8860203
  function clearTimeouts() {
    let id = window.setTimeout(() => {}, 0);
    // console.log('clearing all timeouts/typeWriter calls');
    while (id--) {
      window.clearTimeout(id); // will do nothing if no timeout with id is present
    }
  }

  function resetTyping() {
    isTyping = false;
    totalText = "";
    textIndex = 0;
    // console.log(`reset typing, total text now ${totalText}`);
  }

});

function adjustScroll() {
  let outTop = document.getElementById('output').scrollTop;
  const outMax = document.getElementById('output').scrollTopMax;
  // console.log(`scrollTop: ${outTop}, scrollHeight: ${outMax}`);
  if (outTop < outMax) {
    document.getElementById('output').scrollTop = outMax;
  }
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
document.querySelectorAll("#prefix,#character, #theme-injunction, #character-injunction, #prefix-injunction").forEach(el => {
  el.addEventListener("keyup", event => {
    if (event.key == "Enter" && event.ctrlKey) {
      document.querySelector("#generate-text").click();
      return;
    }
  })
});
