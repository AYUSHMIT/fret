// *****************************************************************************
// Notices:
//
// Copyright © 2019, 2021 United States Government as represented by the Administrator
// of the National Aeronautics and Space Administration. All Rights Reserved.
//
// Disclaimers
//
// No Warranty: THE SUBJECT SOFTWARE IS PROVIDED "AS IS" WITHOUT ANY WARRANTY OF
// ANY KIND, EITHER EXPRESSED, IMPLIED, OR STATUTORY, INCLUDING, BUT NOT LIMITED
// TO, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL CONFORM TO SPECIFICATIONS,
// ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
// OR FREEDOM FROM INFRINGEMENT, ANY WARRANTY THAT THE SUBJECT SOFTWARE WILL BE
// ERROR FREE, OR ANY WARRANTY THAT DOCUMENTATION, IF PROVIDED, WILL CONFORM TO
// THE SUBJECT SOFTWARE. THIS AGREEMENT DOES NOT, IN ANY MANNER, CONSTITUTE AN
// ENDORSEMENT BY GOVERNMENT AGENCY OR ANY PRIOR RECIPIENT OF ANY RESULTS,
// RESULTING DESIGNS, HARDWARE, SOFTWARE PRODUCTS OR ANY OTHER APPLICATIONS
// RESULTING FROM USE OF THE SUBJECT SOFTWARE.  FURTHER, GOVERNMENT AGENCY
// DISCLAIMS ALL WARRANTIES AND LIABILITIES REGARDING THIRD-PARTY SOFTWARE, IF
// PRESENT IN THE ORIGINAL SOFTWARE, AND DISTRIBUTES IT ''AS IS.''
//
// Waiver and Indemnity:  RECIPIENT AGREES TO WAIVE ANY AND ALL CLAIMS AGAINST
// THE UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS
// ANY PRIOR RECIPIENT.  IF RECIPIENT'S USE OF THE SUBJECT SOFTWARE RESULTS IN
// ANY LIABILITIES, DEMANDS, DAMAGES, EXPENSES OR LOSSES ARISING FROM SUCH USE,
// INCLUDING ANY DAMAGES FROM PRODUCTS BASED ON, OR RESULTING FROM, RECIPIENT'S
// USE OF THE SUBJECT SOFTWARE, RECIPIENT SHALL INDEMNIFY AND HOLD HARMLESS THE
// UNITED STATES GOVERNMENT, ITS CONTRACTORS AND SUBCONTRACTORS, AS WELL AS ANY
// PRIOR RECIPIENT, TO THE EXTENT PERMITTED BY LAW.  RECIPIENT'S SOLE REMEDY FOR
// ANY SUCH MATTER SHALL BE THE IMMEDIATE, UNILATERAL TERMINATION OF THIS
// AGREEMENT.
// *****************************************************************************
const fs=require("fs");
const db = require('electron').remote.getGlobal('sharedObj').db;
const modeldb = require('electron').remote.getGlobal('sharedObj').modeldb;
const system_dbkeys = require('electron').remote.getGlobal('sharedObj').system_dbkeys;
const checkDbFormat = require('../fretDbSupport/checkDBFormat.js');

export {
  removeVariablesInBulk as removeVariablesInBulk,
  removeVariables as removeVariables
}



function createVariableMappingToDeleteRequirements (requirements) {
  // this map will be used in the function removeVariables to update requirement list in variables
  let mapVariablesToReqIds = {};
  requirements.forEach(r => {
    if (r.semantics && r.semantics.variables) {
      const variables = checkDbFormat.checkVariableFormat(r.semantics.variables);

      variables.forEach(variable => {
        // glossary id requires project name, component name and variable name
        const variableId = r.project + r.semantics.component_name + variable;
        if(!mapVariablesToReqIds[variableId]){
          mapVariablesToReqIds[variableId] = [];
        }
        // a list of reqid to be removed is kept for each variableId
        mapVariablesToReqIds[variableId].push(r.reqid);

      });
    }
  });
  return mapVariablesToReqIds;
}

function removeVariables (oldVariables, newVariables, projectName, componentName, dbid, oldComponent, oldProject) {
  const oldvars = checkDbFormat.checkVariableFormat(oldVariables);
  oldvars.map(function(variableName){
    var modeldbidOld = oldProject + oldComponent + variableName;
    if (oldComponent !== componentName || projectName !== oldProject || !newVariables.includes(variableName)){
      modeldb.get(modeldbidOld).then(function(v) {
        if (v.reqs && v.reqs.length > 1) {
          var index = v.reqs.indexOf(dbid);
          if (index > -1){
            const newReqs = [...v.reqs];
            newReqs.splice(index, 1)
            modeldb.put({
              ...v,
              reqs: newReqs,
            })
          }
        } else {
          modeldb.remove(v);
        }
      })
    }
  })
}


function removeVariablesInBulk (requirements) {
  let docs = [];
  let mapVariablesToReqIds = createVariableMappingToDeleteRequirements(requirements);
  // We want to do bulk db change.  Get all promises to be resolved before doing update
  Promise.all(Object.entries(mapVariablesToReqIds).map(([variable, reqsToDelete]) => {
     return modeldb.get(variable).then(function(v) {
      // if this variable is referenced by more requirements than the requirements to be removed
      // then we keep this variable and populate the requirement list
      if (v.reqs.length > reqsToDelete.length) {
        // new requirement list
        const newReqs = [];
        v.reqs.forEach(reqId => {
          // if existing requirement is not one of the requirement to be removed then add it to new list
          if(!reqsToDelete.includes(reqId)){
            newReqs.push(reqId);
          }
        });
        docs.push({...v, reqs: newReqs});
      } else {
        // remove variable if there is no requirement referencing it
        //a variable that is set as _deleted is not removed by the database but rather ignored
        docs.push({
          _id: v._id,
          _rev: v._rev,
          reqs: [],
          dataType: '',
          idType: '' ,
          description: '',
          assignment: '',
          modeRequirement: '',
          modeldoc: false,
          modelComponent: '',
          model_id: '',
          _deleted: true})
      }
    })
  })).then(() => {
     return modeldb.bulkDocs(docs)
    }).catch(function (err) {
      console.log(err);
    });
}
