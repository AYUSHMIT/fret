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

import {leveldbDB, modelDB, system_DBkeys} from '../app/main.dev'
import {removeVariablesInBulk, removeVariables } from './modelDbSupport/deleteVariables_main'
import {removeReqsInBulk} from './fretDbSupport/deleteRequirements_main'
import { app, dialog} from 'electron'
import {getContractInfo, getPropertyInfo, getDelayInfo, 
  synchFRETvariables} from './modelDbSupport/variableMappingSupports'
//import FretSemantics from './../app/parser/FretSemantics'
import {export_to_md} from "../app/utils/utilityFunctions";
//const checkDbFormat = require('./fretDbSupport/checkDBFormat.js');
import {synchAnalysisWithDB, } from './fretDbSupport/analysisTabSupport'

//require model methods
//---
//import ejsCacheCoPilot from '../support/CoPilotTemplates/ejsCacheCoPilot'   // this causes dev not to work
const modelDbSetters = require('./modelDbSupport/modelDbSetters_main.js');
const modelDbDelete = require('./modelDbSupport/deleteVariables_main.js');
const fretDbSetters = require('./fretDbSupport/fretDbSetters_main');
const fretDbGetters = require('./fretDbSupport/fretDbGetters_main');
const populateVariables = require('./modelDbSupport/populateVariables_main')
const requirementsImport = require('./requirementsImport/convertAndImportRequirements_main');

const fs = require('fs');
const archiver = require('archiver');
import { v1 as uuidv1 } from 'uuid';
const csv2json=require("csvtojson");
const utilities = require('../support/utilities');

export default class FretModel {
    constructor(){
        // *projects*
        this.listOfProjects = ['All Projects']  // MainView.js list of all projects
        this.selectedProject = 'All Projects'   // MainView.js selected project
        this.fieldColors = {}   // User selections for scope, condition, component, 
                          //shall, timing and response.  SlateEditor2.js fieldColors
        // *requirements*
        this.requirements = []  // requirements from all proljects

        // *analysis*
        this.components = []     // for a specific project: this is an array of all the components
        this.completedComponents = []   // for a specific project: this is an array of all components
        // that we have completed the variable mappings
        this.cocospecData = {}   // for a specific project: this is an object where each 
        // key is a component of this project, and the value of each key is an array of variables
        this.cocospecModes = {}   // for a specific project: this is an object where each 
        // key is a component of this project, and the value of each key is an array of modes

        // *variableMapping*
        this.variable_data = {}  // for a specific project: this is an object where each 
                                // key is a component of this project, and the value  is 
                                // an array[rowid: counter, variable_name, modeldoc_id, idType, dataType, description]
        this.modelComponent = []  // for a specific project: this is an array of strings for dropdown menu titled 'Corresponding Model Component'
        this.modelVariables  = []   // array of simulink model variables from import filtered by the selected model component
        this.selectedVariable = {}  // ui selection
        this.importedComponents = [] // array of imported simulink model components


        // realizability
        this.rlz_data = []
        this.selectedRlz = []
        this.monolithic = false
        this.compositional = false
        this.ccSelected = ''
        this.projectReport = {projectName: '', systemComponents: []}
        this.diagnosisRequirements = []
        this.prevState = {}

    }

    getAllStates() {
      //  returning object with all existing states (not updated from any db changes)
      var states = {

        // projects
        listOfProjects : this.listOfProjects,
        selectedProject : this.selectedProject,
        fieldColors : this.fieldColors,

        // requirements
        requirements : this.requirements, 

        // analysis
        components : this.components,     
        completedComponents : this.completedComponents, 
        cocospecData : this.cocospecData, 
        cocospecModes : this.cocospecModes, 

        // variables
        variable_data : this.variable_data, 
        modelComponent : this.modelComponent, 
        modelVariables : this.modelVariables,   
        selectedVariable : this.selectedVariable, 
        importedComponents : this.importedComponents, 

        // realizability
        rlz_data : this.rlz_data, 
        aselectedRlzbc : this.selectedRlz, 
        monolithic : this.monolithic, 
        compositional : this.compositional, 
        ccSelected : this.ccSelected, 
        projectReport : this.projectReport, 
        diagnosisRequirements : this.diagnosisRequirements, 
        prevState : this.prevState, 
      }
      return states
    }

    async synchStatesWithDB(){

      console.log('FretModel synchStatesWithDB ')
      try {
        await this.synchProjectsAndRequirmentsWithDB()

        // if a project is selected, update project dependent states
        // in AnalysisTab and VariableView
        if (!this.selectedProject === 'All Projects'){
          await this.synchAnalysesAndVariablesWithDB()
        }
      }
      catch (error){
        console.log(`Error in synchStatesWithDB in FretModel: ${error}`);
      }   
    }

    async synchProjectsAndRequirmentsWithDB(){
      console.log('FretModel synchProjectsAndRequirmentsWithDB ')
      try {
        await populateVariables.populateVariables() 

        //projects
        this.listOfProjects = await fretDbGetters.getProjects()
        this.selectedProject = 'All Projects';
        const doc = await fretDbGetters.getDoc('FRET_PROPS')
        this.fieldColors = doc.fieldColors

        // requirements
        this.requirements = await fretDbGetters.getRequirements()

      }
      catch (error){
        console.log(`Error in synchProjectsAndRequirmentsWithDB in FretModel: ${error}`);
      }   


    }

    async synchAnalysesAndVariablesWithDB(){

      // if a project is selected, update project dependent states
      // in AnalysisTab and VariableView
      console.log('FretModel.synchAnalysesAndVariablesWithDB started')
      try {
        // components, cocospecModes, cocospecData, and completedComponents
        const analysisStates = await synchAnalysisWithDB(this.selectedProject)

          if(analysisStates){
            this.cocospecData = analysisStates.cocospecData
            this.cocospecModes = analysisStates.cocospecModes
            this.components = analysisStates.components
            this.completedComponents = analysisStates.completedComponents          
            //console.log('FretModel.synchAnalysesAndVariablesWithDB calling synchFRETvariables ,analysisStates.components: ',analysisStates.components)
          }

          // for each component, we want to call synchFRETvariables
          this.variable_data = {}
          this.modelComponent = {}
          this.modelVariables = {}
          this.importedComponents = {}
          console.log('FretModel.synchAnalysesAndVariablesWithDB looping through components calling synchFRETvariables')
          await Promise.all(this.components.map(async (comp) => {
            var component = comp.component_name
            var componentVariableMapping =  await synchFRETvariables(this.selectedProject,component)
            /*
            console.log('FretModel.synchAnalysesAndVariablesWithDB for component: ',component,
                          ', componentVariableMapping: ', componentVariableMapping)

            console.log('FretModel.synchAnalysesAndVariablesWithDB for component: ',component,
                          ', componentVariableMapping.variable_data: ', componentVariableMapping.variable_data)
            console.log('FretModel.synchAnalysesAndVariablesWithDB for component: ',component,
                          ', componentVariableMapping.modelComponent: ', componentVariableMapping.modelComponent)      
            console.log('FretModel.synchAnalysesAndVariablesWithDB for component: ',component,
                          ', componentVariableMapping.modelVariables: ', componentVariableMapping.modelVariables)
            console.log('FretModel.synchAnalysesAndVariablesWithDB for component: ',component,
                          ', componentVariableMapping.importedComponents: ', componentVariableMapping.importedComponents)                             
                          */
            this.variable_data[component] = componentVariableMapping.variable_data
            this.modelComponent[component] = componentVariableMapping.modelComponent
            this.modelVariables[component] = componentVariableMapping.modelVariables
            this.importedComponents[component] = componentVariableMapping.importedComponents

          }))

          //console.log('FretModel.synchAnalysesAndVariablesWithDB ended, this.variable_data: ', this.variable_data)
          //console.log('FretModel.synchAnalysesAndVariablesWithDB ended, this.modelComponent: ', this.modelComponent)
          //console.log('FretModel.synchAnalysesAndVariablesWithDB ended, this.modelVariables: ', this.modelVariables)
          //console.log('FretModel.synchAnalysesAndVariablesWithDB ended, this.importedComponents: ', this.importedComponents)

      }
      catch (error){
        console.log(`Error synchAnalysesAndVariablesWithDB in FretModel: ${error}`);
      }   
    }

    async initializeFromDB(){
      console.log('FretModel initializeFromDB ')
      try {

        /*
        await populateVariables.populateVariables()   // update model-db from fret-db

        //projects        
        this.listOfProjects = await fretDbGetters.getProjects()
        this.selectedProject = 'All Projects';
        const doc = await fretDbGetters.getDoc('FRET_PROPS');    
        this.fieldColors = doc.fieldColors;

        // requirements
        this.requirements = await fretDbGetters.getRequirements()
        */

        await this.synchStatesWithDB()
        var result =  this.getAllStates()
        return result

      }
      catch (error){
        console.log(`Could not initializeFromDB in FretModel: ${error}`);
      }      
    }

    async addProject(evt,argList){
      console.log('FretModel addProject: ', argList)
      const projName = argList[0]
      try {
        // TBD check that no existing project has projName
        const list =  await fretDbGetters.getProjects();
        if (projName) {
          if (list.includes(projName)){
            console.log('FretModel.addProject ', projName, 'already in project list')
          } else {
            this.listOfProjects = await fretDbSetters.addProject(projName);
          }
        } 
        return {listOfProjects: this.listOfProjects}
      }
      catch (error){
        console.error(`Could not addProject in FretModel: ${error}`);
      }
    }

    async deleteProject(evt,args){

      var project = args[0]
      console.log('FretModel deleteProject: ', project)              
      try {

        await fretDbSetters.deleteProject(project)
        if (this.selectProject === project){
          this.selectProject = 'All Projects'
        }
        await this.synchStatesWithDB()
        var states = {
          // projects
          listOfProjects : this.listOfProjects,
          selectedProject : this.selectedProject,
          // requirements
          requirements : this.requirements, 
          // analysis & variables
          components : this.components,     
          modelComponent : this.modelComponent, 
          modelVariables : this.modelVariables,   
          selectedVariable : this.selectedVariable, 
          importedComponents : this.importedComponents, 
          completedComponents : this.completedComponents, 
          cocospecData : this.cocospecData, 
          cocospecModes : this.cocospecModes, 
        }
        return states

      }
      catch (error){
        console.error(`Could not addProject in FretModel: ${error}`);
      }

    }

    async selectProject(evt,args){
      var projName = args[0]
      console.log('FretModel selectProject: ', projName)
      this.selectedProject = projName

      try {

        await this.synchAnalysesAndVariablesWithDB()

          var states = {
            // projects
            selectedProject : this.selectedProject,   
            // requirements
            requirements : this.requirements, 

            // * analysis
            components : this.components,   
            cocospecData : this.cocospecData, 
            cocospecModes : this.cocospecModes,        
            completedComponents : this.completedComponents, 

            // * variableMapping
            modelComponent : this.modelComponent, 
            variable_data : this.variable_data,
            modelVariables : this.modelVariables,   
            selectedVariable : this.selectedVariable, 
            importedComponents : this.importedComponents,  
            
          }
          return states
    
      }
      catch (error){
        console.error(`Could not selectProject in FretModel: ${error}`);
      }


    }

    async updateFieldColors(evt,arg){
      //console.log('FretModel updateFieldColors arg: ', arg)
      const doc = await fretDbGetters.getDoc('FRET_PROPS');
      var fieldColors = doc.fieldColors
      if(arg){
        const fieldKey = arg[0];
        const color = arg[1];  
        fieldColors[fieldKey] = color.hex
      }
      await fretDbSetters.setFRETProps(doc, fieldColors);
      this.fieldColors = fieldColors

      var states = {
        // projects
        fieldColors : this.fieldColors,
      }
      return states
    }

    async createOrUpdateRequirement(evt,args) {
      //console.log('FretModel addRequirement: ', args)
      var dbid = args[0];
      var dbrev = args[1];
      var edittedFields = args[2];
      var requirementFields = args[3];
      var semantics = args[4];
      var project = args[5];
      var oldVariables = [];

      if (dbrev != undefined){
        //from MODEL
        //const req = await fretDbGetters.getDoc(dbid);
        var req = await fretDbGetters.getDoc(dbid)
        if (req.semantics && req.semantics.variables){
          oldVariables = req.semantics.variables;
        }
          //from MODEL
        await modelDbDelete.removeVariables(oldVariables, semantics.variables ? semantics.variables : [], project,
          semantics.component_name, dbid, req.semantics.component_name, req.project)

      }

      if (semantics && semantics.variables){
        //from MODEL
        modelDbSetters.createOrUpdateVariables(semantics.variables, semantics.component_name, project, dbid);
      }

      this.reqCreated = await fretDbSetters.addRequirement(dbid, dbrev, edittedFields, requirementFields)      
      this.requirements = await fretDbGetters.getRequirements()

      await this.synchAnalysesAndVariablesWithDB()

      var states = {
        // projects
        requirements : this.requirements,
        reqCreated: this.reqCreated,

        // * analysis
        components : this.components,   
        cocospecData : this.cocospecData, 
        cocospecModes : this.cocospecModes,        
        completedComponents : this.completedComponents, 

        // * variableMapping
        modelComponent : this.modelComponent, 
        variable_data : this.variable_data,
        modelVariables : this.modelVariables,   
        selectedVariable : this.selectedVariable, 
        importedComponents : this.importedComponents,  

      }
      return states

    }

    async retrieveRequirement(evt,arg){
      //console.log('FretModel retrieveRequirement arg: ', arg)
      var row = arg[0];

      var doc =  await leveldbDB.get(row.dbkey).then((doc) => {
        doc.dbkey = row.dbkey
        doc.rev = row.rev
        return doc;
      }).catch((err) => {
        console.log(err);
        return err;
      });

      var states = {
        // projects
        doc : doc,
      }
      return states
        
    }

    async deleteRequirement(evt, args){
      console.log('FretModel deleteRequirement: ', args)
      var requirements = args

      try {

        await removeReqsInBulk(requirements);
        await removeVariablesInBulk(requirements);
        await this.synchStatesWithDB()

        var states = {

          // requirements
          requirements : this.requirements, 
          components : this.components,     
          // * analysis
          components : this.components,   
          cocospecData : this.cocospecData, 
          cocospecModes : this.cocospecModes,        
          completedComponents : this.completedComponents, 

          // * variableMapping
          modelComponent : this.modelComponent, 
          variable_data : this.variable_data,
          modelVariables : this.modelVariables,   
          selectedVariable : this.selectedVariable, 
          importedComponents : this.importedComponents,  
        }
        return states

      }
      catch (error){
        console.error(`Could not deleteRequirement in FretModel: ${error}`);
      }        

    }

    formalizeRequirement(evt, args){
      console.log('FretModel formalizeRequirement arg: ', arg)
      var reqName = args[0];

      // need code

      var states = {
        // projects
        requirements : this.requirements,
      }
      return states
        
    }

    async importRequirements(evt,args){
      console.log('FretModel importRequirements: ', args)
      await leveldbDB.info().then(function (info) {
        console.log('levelDB infor: ',info);
      })

      var homeDir = app.getPath('home');
      var listOfProjects  = args;
      var filepaths = dialog.showOpenDialogSync({
        defaultPath : homeDir,
        title : 'Import Requirements',
        buttonLabel : 'Import',
        filters: [
          { name: "Documents",
            extensions: ['json', 'csv']
          }
        ],
        properties: ['openFile']});
      if (filepaths && filepaths.length > 0) {
        console.log('FretModel.importRequirements filepaths: ', filepaths)
         const filepath = filepaths[0];
         //checking the extension of the file
         const fileExtension = filepath.split('.').pop();
         //console.log('fileExtension : ',fileExtension)
         if (fileExtension === 'csv'){
          var importedReqs = await csv2json().fromFile(filepath)
          let csvFields = Object.keys(importedReqs[0]);
          const csvReturnValue = {fileExtension : 'csv',
                                  csvFields: csvFields, 
                                  importedReqs: importedReqs}
          return csvReturnValue
          //return returnValue
         } else if (fileExtension === 'json'){
           /* 
           // Version using "require" causes error: Cannot find module "."
           const filepathnoext = filepath.slice(0,-5); // The slice is to remove the .json suffix
           console.log('*** filepathnoext = ' + JSON.stringify(filepathnoext));
           data = require(filepathnoext);
           */
  
           // Version using "readFileSync" causes error: Cannot read property 'shift' of undefined
           var content = fs.readFileSync(filepath);  // maybe add "utf8" to return a string instead of a buffer
           var data = JSON.parse(content);

  
           /*
           // Version using readTextFile defined above, works.
           readTextFile(filepath, function (text) {
               let data = JSON.parse(text);
           })
           // */
           // Version using readFile, works.
           
           /*
          fs.readFile(filepath, function (err,buffer) {
               if (err) throw err;
               //console.log('buffer: ', buffer)
               let data = JSON.parse(buffer);
               //console.log('FretModel.importRequirements data: ', data)
               //from MODEL
               requirementsImport.importRequirements(data, listOfProjects);
            });
            */
/*
            var content = fs.readFileSync(filepath);  // maybe add "utf8" to return a string instead of a buffer
            var data = JSON.parse(content);
            console.log('FretModel.importRequirements data: ', data)
            //from MODEL
            await requirementsImport.importRequirements(data, listOfProjects);   
*/
            
            await requirementsImport.importRequirements(data, listOfProjects)
            await this.synchAnalysesAndVariablesWithDB()

         }
         else{
           // when we choose an unsupported file
           console.log("We do not support yet this file import")
         }
      }

      this.listOfProjects = await fretDbGetters.getProjects();
      this.requirements = await fretDbGetters.getRequirements()

      var jsonFilestates = {
        // projects
        listOfProjects : this.listOfProjects,
        // requirements
        requirements :  this.requirements, 

        // * analysis
        components : this.components,   
        cocospecData : this.cocospecData, 
        cocospecModes : this.cocospecModes,        
        completedComponents : this.completedComponents,  

        // * variables
        modelComponent : this.modelComponent, 
        variable_data : this.variable_data,
        modelVariables : this.modelVariables,   
        selectedVariable : this.selectedVariable, 
        importedComponents : this.importedComponents,  

      }
      return jsonFilestates
 
    }

    async importRequirementsCsv(evt,args){
      //console.log('FretModel importRequirementsCsv: ', args)
      const importedInfo = args[0];
      await requirementsImport.csvToJsonConvert(importedInfo);

      await this.synchStatesWithDB()

      var states = {
        // projects
        listOfProjects : this.listOfProjects,
        // requirements
        requirements : this.requirements, 
        // * analysis
        components : this.components,   
        cocospecData : this.cocospecData, 
        cocospecModes : this.cocospecModes,        
        completedComponents : this.completedComponents,  

        // * variableMapping
        modelComponent : this.modelComponent, 
        variable_data : this.variable_data,
        modelVariables : this.modelVariables,   
        selectedVariable : this.selectedVariable, 
        importedComponents : this.importedComponents,  
      }
      return states
 
    }

    async exportRequirements(evt,args){
      console.log('FretModel exportRequirements: ', args)
      var project =  args[0];
      var output_format =  args[1];
      const filterOff = project == "All Projects";
      var homeDir = app.getPath('home');
      var filepath = dialog.showSaveDialogSync(
        {
          defaultPath : homeDir,
          title : 'Export Requirements',
          buttonLabel : 'Export',
          filters: [
            { name: "Documents", extensions: [ output_format ] }
          ],
        })
      if (filepath) {
        leveldbDB.allDocs({
          include_docs: true,
        }).then((result) => {
          var filteredReqs = result.rows
          .filter(r => !system_DBkeys.includes(r.key))
          .filter(r => filterOff || r.doc.project == project)
          var filteredResult = []
          filteredReqs.forEach((r) => {
            var doc = (({reqid, parent_reqid, project, rationale, comments, fulltext, semantics, input}) =>
                        ({reqid, parent_reqid, project, rationale, comments, fulltext, semantics, input}))(r.doc)
            doc._id = uuidv1()
            filteredResult.push(doc)
          })
        //
        // produce output
        //
        var content;
        console.log(output_format)
        if (output_format === "md"){
          console.log("MD")
          content=export_to_md(filteredResult, project)
          }
        else {
          console.log("JSON")
                content = JSON.stringify(filteredResult, null, 4)
        }
        //console.log(content)
      
        fs.writeFile(filepath, content, (err) => {
          if(err) {
            return console.log(err);
          }
          console.log("The file was saved!");
          });
            }).catch((err) => {
              console.log(err);
        });
      }

      return ({})
    }

    async changeRequirementStatus(evt,args){
      console.log('FretModel changeRequirementStatus: ', args)
      var dbkey = args[0]
      var statusValue = args[1]

      leveldbDB.get(dbkey).then(function (doc) {
        return leveldbDB.put({ ...doc, status: statusValue }, err => {
          if (err) {
            return console.log(err);
          }
        });
      })

      this.requirements = await fretDbGetters.getRequirements()
      var states = {
        // requirements
        requirements : this.requirements, 
      }
      return states
    }

    async updateVariable_checkNewVariables(evt, args){
      console.log('FretModel updateVariable_checkNewVariables: ', args)

      var project = args[0]
      var component_name = args[1]
      var variables = args[2]
      var idType = args[3]
      var modeldoc_id = args[4]
      var dataType = args[5]
      var modeldbid = args[6]

      var description = args[7]
      var assignment = args[8]
      var lustreValidAssignment = args[9]
      var copilotAssignment = args[10]
      var modeRequirement = args[11]
      var modelComponent = args[12]
      var lustreVariables = args[13]
      var copilotVariables = args[14]
      var moduleName = args[15]

      var completedVariable = false;
      var newVariables = [];
      var openNewVariablesDialog = false

      if (variables.length) {
        await modelDB.find({
          selector: {
            project: project,
            component_name: component_name,
            modeldoc: false
          }
        }).then(function (result) {
          if(result.docs.length != 0) {
            variables.forEach(function (v) {
              if (!result.docs.some(r => r.variable_name === v)) {
                newVariables.push(v);
              }
            })
            console.log('FretModel.updateVariable_checkNewVariables calling handleNewVariables, newVariables: newVariables')
            // return to viewers openNewVariablesDialog
            openNewVariablesDialog = true
          }
        });
      }

      if (openNewVariablesDialog){
        return {openNewVariablesDialog: true, newVariables: newVariables}
      } else {
        return await this.updateVariable_noNewVariables(evt, args)
      }
 
    }

    async updateVariable_noNewVariables(evt, args){
      console.log('FretModel updateVariable_checkNewVariables: ', args)

      var project = args[0]
      var component_name = args[1]
      var variables = args[2]
      var idType = args[3]
      var modeldoc_id = args[4]
      var dataType = args[5]
      var modeldbid = args[6]

      var description = args[7]
      var assignment = args[8]
      var lustreValidAssignment = args[9]
      var copilotAssignment = args[10]
      var modeRequirement = args[11]
      var modelComponent = args[12]
      var lustreVariables = args[13]
      var copilotVariables = args[14]
      var moduleName = args[15]

      var completedVariable = false;

      /*
       For each Variable Type we need the following:
        Mode -> Mode Requirement
        Input/Output -> Model Variable or DataType
        Internal -> Data Type + Variable Assignment
        Function -> nothing (moduleName optionally)
      */
        
      if (idType === "Input" || idType === 'Output') {
        if (modeldoc_id || dataType) {
          completedVariable = true;
        }
      } else if (modeRequirement || (dataType && (assignment || copilotAssignment)) || (idType === "Function")) {
        completedVariable = true;
      }
  
      await modelDB.get(modeldbid).then(function (vdoc) {
        modelDB.put({
          _id: modeldbid,
          _rev: vdoc._rev,
          project: vdoc.project,
          component_name: vdoc.component_name,
          variable_name: vdoc.variable_name,
          reqs: vdoc.reqs,
          dataType: dataType,
          idType: idType,
          moduleName: moduleName,
          description: description,
          assignment: assignment,
          lustreValidAssignment: lustreValidAssignment,
          copilotAssignment: copilotAssignment,
          modeRequirement: modeRequirement,
          modeldoc: false,
          modeldoc_id: modeldoc_id,
          modelComponent: modelComponent,
          completed: completedVariable
        }).catch(function (err) {
          console.log(err);
        });
      })

      await this.synchAnalysesAndVariablesWithDB()
      var states = {
        // * analysis
        components : this.components,   
        cocospecData : this.cocospecData, 
        cocospecModes : this.cocospecModes,        
        completedComponents : this.completedComponents,  
        // * variableMapping
        modelComponent : this.modelComponent, 
        variable_data : this.variable_data,
        modelVariables : this.modelVariables,   
        selectedVariable : this.selectedVariable, 
        importedComponents : this.importedComponents,  
      }
      return states

    }

    async selectVariable(evt,args){
 
      const dbkey =  args[0]
      await modelDB.get(dbkey).then((doc) => {
        this.selectedVariable = doc
      }).catch((err) => {
        console.log(err);
      });

      var states = {
        // * variableMapping
        selectedVariable : this.selectedVariable,     
      }
      return states
    }

    async importComponent(evt,args){     // TBD add tests
      console.log('FretModel importComponent: ', args)

      leveldbDB.info().then(function (info) {
        console.log(info);
      })

      var homeDir = app.getPath('home');
      var selectedProject = args[0];
      var selectedComponent = args[1];


      var filepaths = dialog.showOpenDialogSync({
        defaultPath : homeDir,
        title : 'Import Simulink Model Information',
        buttonLabel : 'Import',
        filters: [
          { name: "Documents", extensions: ['json'] }
        ],
        properties: ['openFile']});
      if (filepaths && filepaths.length > 0) {
            fs.readFile(filepaths[0], 'utf8',
                  function (err,buffer) {
                    if (err) throw err;
                    let content = utilities.replaceStrings([['\\"id\\"','\"_id\"']], buffer);
                    let data = JSON.parse(content);
                    data.forEach((d) => {
                      d._id = uuidv1();
                      d.project = selectedProject;
                      d.fretComponent = selectedComponent;
                      d.modeldoc = true;
                    })
                    return modelDB.bulkDocs(data).catch((err) => {console.log('error', err);});
                  });
      }
   
      var states = {
        // * analysis
        components : this.components,   
        cocospecData : this.cocospecData, 
        cocospecModes : this.cocospecModes,        
        completedComponents : this.completedComponents,  
        // * variableMapping
        modelComponent : this.modelComponent, 
        variable_data : this.variable_data,
        modelVariables : this.modelVariables,   
        selectedVariable : this.selectedVariable, 
        importedComponents : this.importedComponents,  
      }
      return states

    }

    async exportComponent(evt,args){
      var component = args[0];
      var selectedProject = args[1];
      var language = args[2];
      const homeDir = app.getPath('home');
      console.log('FretModel exportComponent, args: ', args)
      console.log('FretModel exportComponent, homeDir: ', homeDir)
 
      var filepath = dialog.showSaveDialogSync({
        defaultPath : homeDir,
        title : 'Export specification',
        buttonLabel : 'Export',
        filters: [
          { name: "Documents", extensions: ['zip'] }
        ],
      });

      if (filepath) {
        // create a file to stream archive data to.
        var output = fs.createWriteStream(filepath);
        var archive = archiver('zip', {
          zlib: { level: 9 } // Sets the compression level.
        });
        // listen for all archive data to be written
        // 'close' event is fired only when a file descriptor is involved
        output.on('close', function() {
          console.log('archiver has been finalized and the output file descriptor has closed.');
        });
        // good practice to catch this error explicitly
        archive.on('error', function(err) {
          throw err;
        });

        modelDB.find({
          selector: {
            component_name: component,
            project: selectedProject,
            completed: true, //for modes that are not completed; these include the ones that correspond to unformalized requirements
            modeldoc: false
          }
        }).then(function (modelResult){

          let contract = getContractInfo(modelResult);
          contract.componentName = component+'Spec';
          archive.pipe(output);
          if (language === 'cocospec' && modelResult.docs[0].modelComponent != ""){
            console.log('FretModel exportComponent, modelResult: ', modelResult)
            console.log('FretModel exportComponent, contract.componentName: ', contract.componentName)
            var variableMapping = getMappingInfo(modelResult, contract.componentName);
            archive.append(JSON.stringify(variableMapping), {name: 'cocospecMapping'+component+'.json'});
          }
          leveldbDB.find({
            selector: {
              project: selectedProject
            }
          }).then(function (fretResult){
            contract.properties = getPropertyInfo(fretResult, contract.outputVariables, component);
            contract.delays = getDelayInfo(fretResult, component);
            if (language === 'cocospec'){
              let contractVariables = [].concat(contract.inputVariables.concat(contract.outputVariables.concat(contract.internalVariables.concat(contract.functions.concat(contract.modes)))));
              for (const property of contract.properties){
                // property.reqid = '__'+property.reqid;
                for (const contractVar of contractVariables) {
                  var regex = new RegExp('\\b' + contractVar.name.substring(2) + '\\b', "g");
                  property.value = property.value.replace(regex, contractVar.name);
                }
                if (!contract.internalVariables.includes("__FTP")) {
                  var regex = new RegExp('\\b' + 'FTP' + '\\b', "g");
                  property.value = property.value.replace(regex, '__FTP');
                }
              }
              archive.append(ejsCache.renderContractCode().contract.complete(contract), {name: contract.componentName+'.lus'})
            } else if (language === 'copilot'){
              contract.internalVariables.push.apply(contract.internalVariables, contract.modes);
              contract.modes.forEach(function(mode) {
                contract.assignments.push(mode.assignment);
              });
              //  KT todo fix this    archive.append(ejsCacheCoPilot.renderCoPilotSpec().contract.complete(contract), {name: contract.componentName+'.json'})
            }
            // finalize the archive (ie we are done appending files but streams have to finish yet)
            archive.finalize();

          }).catch((err) => {
            console.log(err);
          })
        })
      }
      return ({})

    }

    async selectCorspdModelComp(evt,args){       // TBD add tests
      console.log('FretModel selectCorspdModelComp: ', args)

      const modelComponent = args[0]
      const selectedProject = args[1] 
      const selectedComponent = args[2] 
  
      this.modelComponent = modelComponent;
  
      modelDB.find({
        selector: {
          project: selectedProject,
          component_name: selectedComponent,
          modeldoc: false,
        }
      }).then(function (result){
        result.docs.forEach(function(vdoc){
          modelDB.put({
              _id: vdoc._id,
              _rev: vdoc._rev,
              project: vdoc.project,
              component_name: vdoc.component_name,
              variable_name: vdoc.variable_name,
              reqs: vdoc.reqs,
              dataType: "",
              idType: "",
              tool: vdoc.tool,
              description: "",
              assignment: "",
              copilotAssignment: "",
              modeRequirement: "",
              modeldoc: vdoc.modeldoc,
              modelComponent: modelComponent,
              modeldoc_id: "",
            }).then(function (response){
            }).catch(function (err) {
               console.log(err);
            })
        })
      })

      var states = {
        // * analysis
        components : this.components,   
        cocospecData : this.cocospecData, 
        cocospecModes : this.cocospecModes,        
        completedComponents : this.completedComponents,  
        // * variables
        modelComponent : this.modelComponent, 
        variable_data : this.variable_data,
        modelVariables : this.modelVariables,   
        selectedVariable : this.selectedVariable, 
        importedComponents : this.importedComponents,  
      }
      return states

    }

    async checkRealizability(evt,args){
      console.log('FretModel checkRealizability: ', args)
      return ({})
    }

    async diagnoseUnrealizableRequirements(evt,args){
      console.log('FretModel diagnoseUnrealizableRequirements: ', args)
      return ({})
    }

    async saveRealizabilityReport(evt,args){
      console.log('FretModel saveRealizabilityReport: ', args)
      return ({})
    }

    async ltlsimSaveJson(evt,args){
      console.log('FretModel ltlsimSaveJson: ', args)
      return ({})
    }







}

