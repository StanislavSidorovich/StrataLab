/*==============================================================*/
/* DBMS name:      Microsoft SQL Server 2008                    */
/* Created on:     01/01/2026 10:00:00 AM                       */
/*==============================================================*/


if exists (select 1
   from sys.sysreferences r join sys.sysobjects o on (o.id = r.constid and o.type = 'F')
   where r.fkeyid = object_id('ORDER_LINE') and o.name = 'FK_ORDER_LI_CONTAINS_ORDERS')
alter table ORDER_LINE
   drop constraint FK_ORDER_LI_CONTAINS_ORDERS
go

if exists (select 1
   from sys.sysreferences r join sys.sysobjects o on (o.id = r.constid and o.type = 'F')
   where r.fkeyid = object_id('ORDER_LINE') and o.name = 'FK_ORDER_LI_SOLD_AS_PRODUCT')
alter table ORDER_LINE
   drop constraint FK_ORDER_LI_SOLD_AS_PRODUCT
go

if exists (select 1
   from sys.sysreferences r join sys.sysobjects o on (o.id = r.constid and o.type = 'F')
   where r.fkeyid = object_id('ORDERS') and o.name = 'FK_ORDERS_PLACES_CUSTOMER')
alter table ORDERS
   drop constraint FK_ORDERS_PLACES_CUSTOMER
go

if exists (select 1
   from sys.sysreferences r join sys.sysobjects o on (o.id = r.constid and o.type = 'F')
   where r.fkeyid = object_id('CUSTOMER') and o.name = 'FK_CUSTOMER_REFERRED_B_CUSTOMER')
alter table CUSTOMER
   drop constraint FK_CUSTOMER_REFERRED_B_CUSTOMER
go

if exists (select 1
            from  sysindexes
           where  id    = object_id('ORDERS')
            and   name  = 'PLACES_FK'
            and   indid > 0
            and   indid < 255)
   drop index ORDERS.PLACES_FK
go

if exists (select 1
            from  sysobjects
           where  id = object_id('CUSTOMER')
            and   type = 'U')
   drop table CUSTOMER
go

if exists (select 1
            from  sysobjects
           where  id = object_id('ORDERS')
            and   type = 'U')
   drop table ORDERS
go

if exists (select 1
            from  sysobjects
           where  id = object_id('ORDER_LINE')
            and   type = 'U')
   drop table ORDER_LINE
go

if exists (select 1
            from  sysobjects
           where  id = object_id('PRODUCT')
            and   type = 'U')
   drop table PRODUCT
go

/*==============================================================*/
/* Table: CUSTOMER                                              */
/*==============================================================*/
create table CUSTOMER (
   IDCUSTOMER           numeric              identity,
   CUS_IDCUSTOMER       numeric              null,
   FULL_NAME            varchar(80)          not null,
   JOINED_ON            datetime             not null,
   constraint PK_CUSTOMER primary key nonclustered (IDCUSTOMER)
)
go

declare @CurrentUser sysname
select @CurrentUser = user_name()
execute sp_addextendedproperty 'MS_Description', 
   'Who brought this customer in (the customer''s sponsor)',
   'user', @CurrentUser, 'table', 'CUSTOMER', 'column', 'CUS_IDCUSTOMER'
go

/*==============================================================*/
/* Table: ORDERS                                                */
/*==============================================================*/
create table ORDERS (
   IDORDER              numeric              identity,
   IDCUSTOMER           numeric              not null,
   ORDER_DATE           datetime             not null,
   STATUS               varchar(20)          not null,
   constraint PK_ORDERS primary key nonclustered (IDORDER)
)
go

declare @CurrentUser sysname
select @CurrentUser = user_name()
execute sp_addextendedproperty 'MS_Description', 
   'Open, Paid, Shipped',
   'user', @CurrentUser, 'table', 'ORDERS', 'column', 'STATUS'
go

/*==============================================================*/
/* Index: PLACES_FK                                             */
/*==============================================================*/
create index PLACES_FK on ORDERS (
IDCUSTOMER ASC
)
go

/*==============================================================*/
/* Table: ORDER_LINE                                            */
/*==============================================================*/
create table ORDER_LINE (
   IDORDER              numeric              not null,
   IDPRODUCT            numeric              not null,
   QUANTITY             smallint             not null,
   constraint PK_ORDER_LINE primary key nonclustered (IDORDER, IDPRODUCT)
)
go

/*==============================================================*/
/* Table: PRODUCT                                               */
/*==============================================================*/
create table PRODUCT (
   IDPRODUCT            numeric              identity,
   PRODUCT_NAME         varchar(60)          not null,
   UNIT_PRICE           decimal(10,2)        not null,
   constraint PK_PRODUCT primary key nonclustered (IDPRODUCT)
)
go

declare @CurrentUser sysname
select @CurrentUser = user_name()
execute sp_addextendedproperty 'MS_Description', 
   'Items we sell',
   'user', @CurrentUser, 'table', 'PRODUCT'
go

alter table CUSTOMER
   add constraint FK_CUSTOMER_REFERRED_B_CUSTOMER foreign key (CUS_IDCUSTOMER)
      references CUSTOMER (IDCUSTOMER)
go

alter table ORDERS
   add constraint FK_ORDERS_PLACES_CUSTOMER foreign key (IDCUSTOMER)
      references CUSTOMER (IDCUSTOMER)
go

alter table ORDER_LINE
   add constraint FK_ORDER_LI_CONTAINS_ORDERS foreign key (IDORDER)
      references ORDERS (IDORDER)
go

alter table ORDER_LINE
   add constraint FK_ORDER_LI_SOLD_AS_PRODUCT foreign key (IDPRODUCT)
      references PRODUCT (IDPRODUCT)
go

