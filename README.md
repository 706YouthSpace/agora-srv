## 若干说明

## 整体结构

总体来讲项目通过 tsyringe 依赖注入相互组织。

tskit 收集了大量工具, 通过git形式安装，可以单独clone

各服务主要继承 AsyncService 基类， 子类有义务 this.emit('ready')，表明服务可用。  
可以 this.emit('revoked') 表明服务不再可用， 同时实现this.init()函数，完成服务重新拉起，再次this.emit('ready')。