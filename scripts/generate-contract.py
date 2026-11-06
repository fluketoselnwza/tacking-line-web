import json,copy
from pathlib import Path
paths={}
filter_names=['from','to','month','year','dataset','productCode','recipeCode','lineCode','remark','kibbleCode','search','grain','page','pageSize','sort','order']
filters=[{'name':n,'in':'query','schema':{'type':'string'}} for n in filter_names]
for route,methods in {
'auth/login':['post'],'auth/logout':['post'],'auth/me':['get'],
'import/preview':['post'],'import/confirm':['post'],'import/history':['get'],'import/history/{id}':['get'],'import/history/{id}/errors':['get'],'import/history/{id}/rollback':['post'],
'dashboard/summary':['get'],'dashboard/daily-usage':['get'],'dashboard/line-distribution':['get'],'dashboard/top-recipes':['get'],'dashboard/fg-wip':['get'],'dashboard/kibble':['get'],
'records':['get'],'records/{id}':['get','patch','delete'],'recipes':['get'],'lines':['get'],'export':['get'],'filters':['get'],'audit':['get']}.items():
 path='/api/'+route;paths[path]={}
 for method in methods:
  op={'operationId':method+'_'+route.replace('/','_').replace('{','').replace('}',''),'summary':method.upper()+' '+route,'security':[{'session':[]}],'parameters':[],'responses':{str(status):{'description':description} for status,description in [(200,'Success'),(400,'Invalid input'),(401,'Unauthenticated'),(403,'Forbidden; Admin required for writes, same-origin Origin required'),(409,'Duplicate/conflict or unsafe rollback'),(410,'Expired preview'),(413,'File, row or export limit exceeded'),(422,'Workbook validation failed'),(429,'Login throttled'),(500,'Safe server error')]}}
  if '{id}' in route:op['parameters'].append({'name':'id','in':'path','required':True,'schema':{'type':'string'}})
  if method=='get' and route.split('/')[0] in ['dashboard','records','recipes','lines','export','filters']:op['parameters']+=copy.deepcopy(filters)
  if route=='auth/login':
   op['security']=[]
   op['requestBody']={'required':True,'content':{'application/json':{'schema':{'type':'object','required':['email','password'],'properties':{'email':{'type':'string','format':'email'},'password':{'type':'string','format':'password'}}}}}}
  if route=='import/preview':op['requestBody']={'required':True,'content':{'multipart/form-data':{'schema':{'type':'object','required':['file'],'properties':{'file':{'type':'string','format':'binary'},'dataset':{'type':'string','default':'BIN'}}}}}}
  if route=='import/confirm':op['requestBody']={'required':True,'content':{'application/json':{'schema':{'type':'object','required':['batchId','mode'],'properties':{'batchId':{'type':'string'},'mode':{'type':'string','enum':['skip','replace','cancel']}}}}}}
  if route=='records/{id}' and method=='patch':
   keys=['usageDate','recordNo','productCode','recipeCode','lineCode','sumMassKg','eachKg','remark','kibbleCode']
   props={k:{'type':'string'} for k in keys};props['sumMassKg']['nullable']=True
   op['requestBody']={'required':True,'content':{'application/json':{'schema':{'type':'object','required':keys,'additionalProperties':False,'properties':props}}}}
  if route=='export':op['parameters']+=[{'name':'format','in':'query','schema':{'type':'string','enum':['xlsx','csv']}},{'name':'type','in':'query','schema':{'type':'string','enum':['records','summary','recipes','lines']}}]
  paths[path][method]=op
spec={'openapi':'3.0.3','info':{'title':'MaterialIQ API','version':'1.0.0','description':'Session auth. All writes require same-origin Origin; all writes except logout require Admin. Weights are exact decimal strings. Inclusive calendar date filters and dimensions are combined. See api-contract.md for response shapes and import semantics.'},'servers':[{'url':'http://localhost:3000'}],'components':{'securitySchemes':{'session':{'type':'apiKey','in':'cookie','name':'recipe_session'}}},'paths':paths}
Path('docs/openapi.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2))
collection={'info':{'name':'MaterialIQ API','schema':'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'},'variable':[{'key':k,'value':v} for k,v in [('baseUrl','http://localhost:3000'),('email',''),('password',''),('id',''),('batchId','')]],'item':[]}
for path,ops in paths.items():
 for method,op in ops.items():
  url='{{baseUrl}}'+path.replace('{id}','{{id}}')
  req={'method':method.upper(),'header':[],'url':url,'description':op['summary']}
  if method!='get':req['header'].append({'key':'Origin','value':'{{baseUrl}}'})
  if path=='/api/auth/login':req['body']={'mode':'raw','raw':json.dumps({'email':'{{email}}','password':'{{password}}'})};req['header'].append({'key':'Content-Type','value':'application/json'})
  if path=='/api/import/confirm':req['body']={'mode':'raw','raw':json.dumps({'batchId':'{{batchId}}','mode':'skip'})};req['header'].append({'key':'Content-Type','value':'application/json'})
  if path=='/api/import/preview':req['body']={'mode':'formdata','formdata':[{'key':'file','type':'file','src':''},{'key':'dataset','type':'text','value':'BIN'}]}
  collection['item'].append({'name':op['summary'],'request':req})
Path('docs/postman.collection.json').write_text(json.dumps(collection,ensure_ascii=False,indent=2))
print('Generated OpenAPI and Postman collection:',sum(len(v) for v in paths.values()),'operations')
